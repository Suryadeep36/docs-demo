import { useMemo, useState } from 'react'
import './App.css'

function App() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const apiUrl = useMemo(() => {
    return import.meta.env.VITE_DOC_TYPE_API_URL || '/api/document-type'
  }, [])

  function onFilePicked(file) {
    setSelectedFile(file)
    setResult(null)
    setError('')
  }

  function onFileInputChange(event) {
    const file = event.target.files?.[0]
    if (file) {
      onFilePicked(file)
    }
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

    if (file) {
      onFilePicked(file)
    }
  }

  async function detectDocumentType() {
    if (!selectedFile || isLoading) return

    setIsLoading(true)
    setError('')
    setResult(null)

    const formData = new FormData()

    // Must match your backend
    formData.append('filepath', selectedFile)

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok || data.success === false) {
        throw new Error(
          data.error || `Request failed with status ${response.status}`
        )
      }

      setResult(data)
    } catch (err) {
      setError(err.message || 'Failed to classify document.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="app">
      <section className="card">
        <h1>Document Type Detector</h1>

        <p className="subtext">
          Upload a PDF or image to classify the document.
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

          <span>Drag & Drop a file here</span>
          <span className="or">or</span>
          <span className="link">Click to browse</span>
        </label>

        <div className="file-row">
          <strong>Selected:</strong>
          <span>{selectedFile ? selectedFile.name : 'No file selected'}</span>
        </div>

        <button
          type="button"
          onClick={detectDocumentType}
          disabled={!selectedFile || isLoading}
        >
          {isLoading ? 'Classifying...' : 'Classify Document'}
        </button>

        {result && (
          <div className="result">
            <p>
              <strong>Document Type:</strong> {result.document_type}
            </p>

            <p>
              <strong>Confidence:</strong>{' '}
              {(result.confidence * 100).toFixed(2)}%
            </p>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <p className="hint">
          API endpoint: <code>{apiUrl}</code>
        </p>
      </section>
    </main>
  )
}

export default App