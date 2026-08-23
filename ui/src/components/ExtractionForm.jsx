import { useState, useMemo, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

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

export default function ExtractionForm({ documentId, initialData }) {
  const [originalData, setOriginalData] = useState(initialData || {})
  const [edited, setEdited] = useState(structuredClone(initialData || {}))
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    setOriginalData(initialData || {})
    setEdited(structuredClone(initialData || {}))
  }, [initialData])

  const isDirty = useMemo(() => {
    if (!originalData || !edited) return false
    return JSON.stringify(originalData) !== JSON.stringify(edited)
  }, [originalData, edited])

  function updateStudent(field, value) {
    setEdited((prev) => ({
      ...prev,
      student: { ...(prev.student || {}), [field]: value },
    }))
  }

  function updateInstitution(field, value) {
    setEdited((prev) => ({
      ...prev,
      institution: { ...(prev.institution || {}), [field]: value },
    }))
  }

  function updateSubject(index, field, value) {
    setEdited((prev) => {
      const subjects = prev.subjects ? [...prev.subjects] : []
      if (!subjects[index]) subjects[index] = {}
      subjects[index] = { ...subjects[index], [field]: value }
      return { ...prev, subjects }
    })
  }

  function updateSubjectMark(index, field, key, value) {
    setEdited((prev) => {
      const subjects = prev.subjects ? [...prev.subjects] : []
      if (!subjects[index]) subjects[index] = {}
      const subj = subjects[index]
      subj[field] = { ...(subj[field] || {}), [key]: value }
      return { ...prev, subjects }
    })
  }

  function addSubject() {
    setEdited((prev) => ({
      ...prev,
      subjects: [...(prev.subjects || []), {}]
    }))
  }

  function removeSubject(index) {
    setEdited((prev) => ({
      ...prev,
      subjects: (prev.subjects || []).filter((_, i) => i !== index)
    }))
  }

  function updateSummary(field, value) {
    setEdited((prev) => ({
      ...prev,
      summary: { ...(prev.summary || {}), [field]: value },
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

  if (!edited) return null

  return (
    <div className="result extraction-form">
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
      <div className="section">
        <h2>Student Details</h2>
        <div className="info-grid">
          <Field
            label="Name"
            value={edited.student?.name}
            onChange={(value) => updateStudent('name', value)}
          />
          <Field
            label="Roll Number"
            value={edited.student?.roll_number}
            onChange={(value) => updateStudent('roll_number', value)}
          />
          <Field
            label="Registration Number"
            value={edited.student?.registration_number}
            onChange={(value) => updateStudent('registration_number', value)}
          />
          <Field
            label="Date of Birth"
            value={edited.student?.date_of_birth}
            onChange={(value) => updateStudent('date_of_birth', value)}
          />
        </div>
      </div>

      {/* INSTITUTION DETAILS */}
      <div className="section">
        <h2>Institution</h2>
        <div className="info-grid">
          <Field
            label="Institution"
            value={edited.institution?.name}
            onChange={(value) => updateInstitution('name', value)}
          />
          <Field
            label="Board / University"
            value={edited.institution?.board}
            onChange={(value) => updateInstitution('board', value)}
          />
          <Field
            label="Course"
            value={edited.institution?.course}
            onChange={(value) => updateInstitution('course', value)}
          />
          <Field
            label="Semester"
            value={edited.institution?.semester}
            onChange={(value) => updateInstitution('semester', value)}
          />
        </div>
      </div>

      {/* SUBJECTS */}
      <div className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Subject-wise Marks</h2>
          <button type="button" onClick={addSubject} style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}>+ Add Subject</button>
        </div>
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
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {(edited.subjects || []).map((subject, index) => (
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
                  <td>
                    <button type="button" onClick={() => removeSubject(index)} style={{ padding: '0.25rem', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>X</button>
                  </td>
                </tr>
              ))}
              {(!edited.subjects || edited.subjects.length === 0) && (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', color: '#64748b' }}>No subjects found. Click Add Subject to add one.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SUMMARY */}
      <div className="section">
        <h2>Result Summary</h2>
        <div className="summary-grid">
          <div className="summary-card">
            <strong>Total Marks</strong>
            <div className="mark-pair">
              <input
                type="text"
                value={edited.summary?.total_obtained ?? ''}
                placeholder="-"
                onChange={(e) => updateSummary('total_obtained', e.target.value)}
              />
              <span>/</span>
              <input
                type="text"
                value={edited.summary?.total_maximum ?? ''}
                placeholder="-"
                onChange={(e) => updateSummary('total_maximum', e.target.value)}
              />
            </div>
          </div>
          <div className="summary-card">
            <strong>Percentage</strong>
            <input
              type="text"
              value={edited.summary?.percentage ?? ''}
              placeholder="-"
              onChange={(e) => updateSummary('percentage', e.target.value)}
            />
          </div>
          <div className="summary-card">
            <strong>CGPA</strong>
            <input
              type="text"
              value={edited.summary?.cgpa ?? ''}
              placeholder="-"
              onChange={(e) => updateSummary('cgpa', e.target.value)}
            />
          </div>
          <div className="summary-card">
            <strong>Result</strong>
            <input
              type="text"
              value={edited.summary?.result ?? ''}
              placeholder="-"
              onChange={(e) => updateSummary('result', e.target.value)}
            />
          </div>
        </div>
      </div>

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

      {/* RAW JSON (Optional) */}
      <div className="section">
        <details>
          <summary>View Edited JSON</summary>
          <pre>{JSON.stringify(edited, null, 2)}</pre>
        </details>
      </div>
    </div>
  )
}
