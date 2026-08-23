import { useMemo, useState } from 'react'
import '../App.css'

const N8N_URL = 'http://localhost:5678/webhook-test/classify-document'
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

import ExtractionForm from '../components/ExtractionForm'

function UploadView() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const [documentId, setDocumentId] = useState(null)
  const [originalData, setOriginalData] = useState(null)


  function onFilePicked(file) {
    setSelectedFile(file)
    setError('')
    setStatusMessage('')
    resetEdits()
  }

  function onFileInputChange(event) {
    const file = event.target.files?.[0]
    if (file) onFilePicked(file)
  }

  function onDragOver(event) {
    event.preventDefault()
    setIsDragging(true)
  }

  function onDragLeave(event) {
    event.preventDefault()
    setIsDragging(false)
  }

  function onDrop(event) {
    event.preventDefault()
    setIsDragging(false)

    const file = event.dataTransfer.files?.[0]
    if (file) onFilePicked(file)
  }

  function resetEdits() {
    setDocumentId(null)
    setOriginalData(null)
  }

  async function waitForExtraction(docId, maxAttempts = 45) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await sleep(2000)

      try {
        const res = await fetch(`${API_URL}/documents/${docId}/extraction`)
        if (res.ok) {
          return await res.json()
        }
      } catch {
        // Backend hiccup, keep polling.
      }
    }

    throw new Error('Extraction is taking too long. Try again later.')
  }

  function extractDocumentId(data) {
    return (
      data?.document_id ??
      data?.doc_id ??
      data?.documentId ??
      (typeof data?.id === 'string' && data.id.includes('-') ? data.id : null)
    )
  }

  async function extractDocumentData() {
    if (!selectedFile || isLoading) return

    setIsLoading(true)
    setError('')
    setStatusMessage('')
    resetEdits()

    try {
      // 1. Create the Document in the backend first
      setStatusMessage('Creating document record...')
      const createFormData = new FormData()
      createFormData.append('file', selectedFile)
      createFormData.append('original_filename', selectedFile.name)

      const createRes = await fetch(`${API_URL}/documents`, {
        method: 'POST',
        body: createFormData,
      })
      if (!createRes.ok) throw new Error('Failed to create document in backend')
      
      const docRecord = await createRes.json()
      const docId = docRecord.id
      setDocumentId(docId)

      // 2. Process with n8n AI Workflow
      setStatusMessage('Running AI extraction workflow...')
      const n8nFormData = new FormData()
      n8nFormData.append('data', selectedFile) // n8n expects binary data

      const response = await fetch(N8N_URL, {
        method: 'POST',
        body: n8nFormData,
      })

      if (!response.ok) {
        throw new Error(`n8n Workflow failed with status ${response.status}. Make sure "Execute Workflow" is clicked in n8n if using webhook-test!`)
      }

      const extractionData = await response.json()

      // 3. Save the extraction to the backend
      setStatusMessage('Saving extraction results...')
      const saveRes = await fetch(`${API_URL}/documents/${docId}/extraction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: extractionData.document_type || 'Unknown',
          raw_llm_output: extractionData,
          extracted_data: extractionData
        })
      })

      if (!saveRes.ok) throw new Error('Failed to save extraction to backend')

      const finalExtraction = await saveRes.json()

      setOriginalData(finalExtraction.extracted_data || {})
      setOriginalData(finalExtraction.extracted_data || {})
      setStatusMessage('')
    } catch (err) {
      setError(err.message || 'Failed to extract document data.')
      setStatusMessage('')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="app">
      <section className="container">

        <h1>Academic Document Extractor</h1>

        <p className="subtext">
          Upload a marksheet or academic document to extract and correct its information.
        </p>

        <label
          className={`dropzone${isDragging ? ' drag-over' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <input
            type="file"
            accept=".pdf,image/*"
            onChange={onFileInputChange}
          />

          <span>Drag &amp; Drop a file here</span>
          <span className="or">or</span>
          <span className="link">Click to browse</span>
        </label>

        <div className="file-row">
          <strong>Selected:</strong>
          <span>
            {selectedFile ? selectedFile.name : 'No file selected'}
          </span>
        </div>

        <button
          type="button"
          onClick={extractDocumentData}
          disabled={!selectedFile || isLoading}
        >
          {isLoading ? 'Extracting...' : 'Extract Document Data'}
        </button>

        {statusMessage && (
          <p className="status">{statusMessage}</p>
        )}

        {error && (
          <p className="error">
            {error}
          </p>
        )}

        {originalData && (
          <ExtractionForm documentId={documentId} initialData={originalData} />
        )}

        <p className="hint">
          Workflow endpoint: <code>{N8N_URL}</code>
          {' | '}
          Backend endpoint: <code>{API_URL}</code>
        </p>

      </section>
    </main>
  )
}

export default UploadView
