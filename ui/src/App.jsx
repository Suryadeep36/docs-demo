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

  async function extractDocumentData() {
    if (!selectedFile || isLoading) return

    setIsLoading(true)
    setError('')
    setResult(null)

    const formData = new FormData()

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

      /*
       * If your backend returns the marksheet JSON directly:
       *
       * {
       *   document_type: "marksheet",
       *   student: {...},
       *   institution: {...},
       *   subjects: [...],
       *   summary: {...}
       * }
       *
       * then this is enough.
       */
      setResult(data)
    } catch (err) {
      setError(err.message || 'Failed to extract document data.')
    } finally {
      setIsLoading(false)
    }
  }

  function formatMark(mark) {
    if (!mark) return '-'

    if (mark.obtained == null && mark.maximum == null) {
      return '-'
    }

    if (mark.maximum == null) {
      return `${mark.obtained ?? '-'}`
    }

    return `${mark.obtained ?? '-'}/${mark.maximum}`
  }

  return (
    <main className="app">
      <section className="container">

        <h1>Academic Document Extractor</h1>

        <p className="subtext">
          Upload a marksheet or academic document to extract its information.
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

        {error && (
          <p className="error">
            {error}
          </p>
        )}

        {result && (
          <div className="result">

            {/* DOCUMENT TYPE */}
            <div className="section">
              <h2>Document Information</h2>

              <div className="info-grid">
                <div>
                  <strong>Document Type</strong>
                  <span>{result.document_type || '-'}</span>
                </div>
              </div>
            </div>

            {/* STUDENT DETAILS */}
            {result.student && (
              <div className="section">
                <h2>Student Details</h2>

                <div className="info-grid">
                  <div>
                    <strong>Name</strong>
                    <span>{result.student.name || '-'}</span>
                  </div>

                  <div>
                    <strong>Roll Number</strong>
                    <span>{result.student.roll_number || '-'}</span>
                  </div>

                  <div>
                    <strong>Registration Number</strong>
                    <span>
                      {result.student.registration_number || '-'}
                    </span>
                  </div>

                  <div>
                    <strong>Date of Birth</strong>
                    <span>
                      {result.student.date_of_birth || '-'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* INSTITUTION DETAILS */}
            {result.institution && (
              <div className="section">
                <h2>Institution</h2>

                <div className="info-grid">
                  <div>
                    <strong>Institution</strong>
                    <span>{result.institution.name || '-'}</span>
                  </div>

                  <div>
                    <strong>Board / University</strong>
                    <span>{result.institution.board || '-'}</span>
                  </div>

                  <div>
                    <strong>Course</strong>
                    <span>{result.institution.course || '-'}</span>
                  </div>

                  <div>
                    <strong>Semester</strong>
                    <span>{result.institution.semester || '-'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* SUBJECTS */}
            {Array.isArray(result.subjects) && result.subjects.length > 0 && (
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
                      {result.subjects.map((subject, index) => (
                        <tr key={index}>
                          <td>{index + 1}</td>

                          <td>
                            {subject.name || '-'}
                          </td>

                          <td>
                            {subject.code || '-'}
                          </td>

                          <td>
                            {formatMark(subject.theory)}
                          </td>

                          <td>
                            {formatMark(subject.practical)}
                          </td>

                          <td>
                            {formatMark(subject.total)}
                          </td>

                          <td>
                            {subject.grade || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUMMARY */}
            {result.summary && (
              <div className="section">
                <h2>Result Summary</h2>

                <div className="summary-grid">

                  <div className="summary-card">
                    <strong>Total Marks</strong>
                    <span>
                      {result.summary.total_obtained ?? '-'}
                      {' / '}
                      {result.summary.total_maximum ?? '-'}
                    </span>
                  </div>

                  <div className="summary-card">
                    <strong>Percentage</strong>
                    <span>
                      {result.summary.percentage != null
                        ? `${result.summary.percentage}%`
                        : '-'}
                    </span>
                  </div>

                  <div className="summary-card">
                    <strong>CGPA</strong>
                    <span>
                      {result.summary.cgpa ?? '-'}
                    </span>
                  </div>

                  <div className="summary-card">
                    <strong>Result</strong>
                    <span>
                      {result.summary.result || '-'}
                    </span>
                  </div>

                </div>
              </div>
            )}

            {/* RAW JSON */}
            <div className="section">
              <details>
                <summary>View Extracted JSON</summary>

                <pre>
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </div>

          </div>
        )}

        <p className="hint">
          API endpoint: <code>{apiUrl}</code>
        </p>

      </section>
    </main>
  )
}

export default App