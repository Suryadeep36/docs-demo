import { useMemo, useState } from 'react'
import './App.css'

const N8N_URL = 'http://localhost:5678/webhook-test/classify-document'
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function Field({ label, value, onChange }) {
  return (
    <div>
      <strong>{label}</strong>
      <input
        type="text"
        value={value ?? ''}
        placeholder="-"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function App() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const [documentId, setDocumentId] = useState(null)
  const [originalData, setOriginalData] = useState(null)
  const [edited, setEdited] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const isDirty = useMemo(() => {
    if (!originalData || !edited) return false
    return JSON.stringify(originalData) !== JSON.stringify(edited)
  }, [originalData, edited])

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
    setEdited(null)
    setSaveError('')
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

    const formData = new FormData()
    formData.append('filepath', selectedFile)

    try {
      setStatusMessage('Uploading and processing document...')
      const response = await fetch(N8N_URL, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok || data.success === false) {
        throw new Error(
          data.error || `Request failed with status ${response.status}`
        )
      }

      const docId = extractDocumentId(data)

      if (!docId) {
        throw new Error('Workflow did not return a document_id.')
      }

      setDocumentId(docId)
      setStatusMessage('Waiting for extraction to be stored...')

      const extraction = await waitForExtraction(docId)

      setOriginalData(extraction.extracted_data || {})
      setEdited(structuredClone(extraction.extracted_data || {}))
      setStatusMessage('')
    } catch (err) {
      setError(err.message || 'Failed to extract document data.')
      setStatusMessage('')
    } finally {
      setIsLoading(false)
    }
  }

  function updateStudent(field, value) {
    setEdited((prev) => ({
      ...prev,
      student: { ...prev.student, [field]: value },
    }))
  }

  function updateInstitution(field, value) {
    setEdited((prev) => ({
      ...prev,
      institution: { ...prev.institution, [field]: value },
    }))
  }

  function updateSubject(index, field, value) {
    setEdited((prev) => ({
      ...prev,
      subjects: prev.subjects.map((subject, i) =>
        i === index ? { ...subject, [field]: value } : subject
      ),
    }))
  }

  function updateSubjectMark(index, field, key, value) {
    setEdited((prev) => ({
      ...prev,
      subjects: prev.subjects.map((subject, i) =>
        i === index
          ? { ...subject, [field]: { ...subject[field], [key]: value } }
          : subject
      ),
    }))
  }

  function updateSummary(field, value) {
    setEdited((prev) => ({
      ...prev,
      summary: { ...prev.summary, [field]: value },
    }))
  }

  function discardChanges() {
    setEdited(structuredClone(originalData))
    setSaveError('')
  }

  async function saveChanges() {
    if (!documentId || !isDirty || isSaving) return

    setIsSaving(true)
    setSaveError('')

    try {
      const res = await fetch(
        `${API_URL}/documents/${documentId}/extraction`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ extracted_data: edited }),
        }
      )

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        throw new Error(detail.detail || `Save failed (${res.status})`)
      }

      setOriginalData(structuredClone(edited))
    } catch (err) {
      setSaveError(err.message || 'Failed to save changes.')
    } finally {
      setIsSaving(false)
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

        {edited && (
          <div className="result">

            {/* DOCUMENT TYPE */}
            <div className="section">
              <h2>Document Information</h2>

              <div className="info-grid">
                <Field
                  label="Document Type"
                  value={edited.document_type}
                  onChange={(value) =>
                    setEdited((prev) => ({ ...prev, document_type: value }))
                  }
                />
                <div>
                  <strong>Document ID</strong>
                  <span className="mono">{documentId}</span>
                </div>
              </div>
            </div>

            {/* STUDENT DETAILS */}
            {edited.student && (
              <div className="section">
                <h2>Student Details</h2>

                <div className="info-grid">
                  <Field
                    label="Name"
                    value={edited.student.name}
                    onChange={(value) => updateStudent('name', value)}
                  />

                  <Field
                    label="Roll Number"
                    value={edited.student.roll_number}
                    onChange={(value) => updateStudent('roll_number', value)}
                  />

                  <Field
                    label="Registration Number"
                    value={edited.student.registration_number}
                    onChange={(value) => updateStudent('registration_number', value)}
                  />

                  <Field
                    label="Date of Birth"
                    value={edited.student.date_of_birth}
                    onChange={(value) => updateStudent('date_of_birth', value)}
                  />
                </div>
              </div>
            )}

            {/* INSTITUTION DETAILS */}
            {edited.institution && (
              <div className="section">
                <h2>Institution</h2>

                <div className="info-grid">
                  <Field
                    label="Institution"
                    value={edited.institution.name}
                    onChange={(value) => updateInstitution('name', value)}
                  />

                  <Field
                    label="Board / University"
                    value={edited.institution.board}
                    onChange={(value) => updateInstitution('board', value)}
                  />

                  <Field
                    label="Course"
                    value={edited.institution.course}
                    onChange={(value) => updateInstitution('course', value)}
                  />

                  <Field
                    label="Semester"
                    value={edited.institution.semester}
                    onChange={(value) => updateInstitution('semester', value)}
                  />
                </div>
              </div>
            )}

            {/* SUBJECTS */}
            {Array.isArray(edited.subjects) && edited.subjects.length > 0 && (
              <div className="section">
                <h2>Subject-wise Marks</h2>

                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Subject</th>
                        <th>Code</th>
                        <th>Theory</th>
                        <th>Practical</th>
                        <th>Total</th>
                        <th>Grade</th>
                      </tr>
                    </thead>

                    <tbody>
                      {edited.subjects.map((subject, index) => (
                        <tr key={index}>
                          <td>{index + 1}</td>

                          <td>
                            <input
                              type="text"
                              value={subject.name ?? ''}
                              placeholder="-"
                              onChange={(e) => updateSubject(index, 'name', e.target.value)}
                            />
                          </td>

                          <td>
                            <input
                              type="text"
                              className="cell-narrow"
                              value={subject.code ?? ''}
                              placeholder="-"
                              onChange={(e) => updateSubject(index, 'code', e.target.value)}
                            />
                          </td>

                          <td>
                            <div className="mark-pair">
                              <input
                                type="text"
                                className="cell-mark"
                                value={subject.theory?.obtained ?? ''}
                                placeholder="-"
                                onChange={(e) => updateSubjectMark(index, 'theory', 'obtained', e.target.value)}
                              />
                              <span>/</span>
                              <input
                                type="text"
                                className="cell-mark"
                                value={subject.theory?.maximum ?? ''}
                                placeholder="-"
                                onChange={(e) => updateSubjectMark(index, 'theory', 'maximum', e.target.value)}
                              />
                            </div>
                          </td>

                          <td>
                            <div className="mark-pair">
                              <input
                                type="text"
                                className="cell-mark"
                                value={subject.practical?.obtained ?? ''}
                                placeholder="-"
                                onChange={(e) => updateSubjectMark(index, 'practical', 'obtained', e.target.value)}
                              />
                              <span>/</span>
                              <input
                                type="text"
                                className="cell-mark"
                                value={subject.practical?.maximum ?? ''}
                                placeholder="-"
                                onChange={(e) => updateSubjectMark(index, 'practical', 'maximum', e.target.value)}
                              />
                            </div>
                          </td>

                          <td>
                            <div className="mark-pair">
                              <input
                                type="text"
                                className="cell-mark"
                                value={subject.total?.obtained ?? ''}
                                placeholder="-"
                                onChange={(e) => updateSubjectMark(index, 'total', 'obtained', e.target.value)}
                              />
                              <span>/</span>
                              <input
                                type="text"
                                className="cell-mark"
                                value={subject.total?.maximum ?? ''}
                                placeholder="-"
                                onChange={(e) => updateSubjectMark(index, 'total', 'maximum', e.target.value)}
                              />
                            </div>
                          </td>

                          <td>
                            <input
                              type="text"
                              className="cell-narrow"
                              value={subject.grade ?? ''}
                              placeholder="-"
                              onChange={(e) => updateSubject(index, 'grade', e.target.value)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUMMARY */}
            {edited.summary && (
              <div className="section">
                <h2>Result Summary</h2>

                <div className="summary-grid">

                  <div className="summary-card">
                    <strong>Total Marks</strong>
                    <div className="mark-pair">
                      <input
                        type="text"
                        value={edited.summary.total_obtained ?? ''}
                        placeholder="-"
                        onChange={(e) => updateSummary('total_obtained', e.target.value)}
                      />
                      <span>/</span>
                      <input
                        type="text"
                        value={edited.summary.total_maximum ?? ''}
                        placeholder="-"
                        onChange={(e) => updateSummary('total_maximum', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="summary-card">
                    <strong>Percentage</strong>
                    <input
                      type="text"
                      value={edited.summary.percentage ?? ''}
                      placeholder="-"
                      onChange={(e) => updateSummary('percentage', e.target.value)}
                    />
                  </div>

                  <div className="summary-card">
                    <strong>CGPA</strong>
                    <input
                      type="text"
                      value={edited.summary.cgpa ?? ''}
                      placeholder="-"
                      onChange={(e) => updateSummary('cgpa', e.target.value)}
                    />
                  </div>

                  <div className="summary-card">
                    <strong>Result</strong>
                    <input
                      type="text"
                      value={edited.summary.result ?? ''}
                      placeholder="-"
                      onChange={(e) => updateSummary('result', e.target.value)}
                    />
                  </div>

                </div>
              </div>
            )}

            {/* SAVE BAR */}
            <div className="save-bar">
              {saveError && <p className="save-error">{saveError}</p>}

              <div className="save-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={discardChanges}
                  disabled={!isDirty || isSaving}
                >
                  Discard Changes
                </button>

                <button
                  type="button"
                  onClick={saveChanges}
                  disabled={!isDirty || isSaving}
                >
                  {isSaving ? 'Saving...' : isDirty ? 'Save Changes' : 'Saved'}
                </button>
              </div>
            </div>

            {/* RAW JSON */}
            <div className="section">
              <details>
                <summary>View Edited JSON</summary>

                <pre>
                  {JSON.stringify(edited, null, 2)}
                </pre>
              </details>
            </div>

          </div>
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

export default App
