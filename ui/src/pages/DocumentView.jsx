import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import ExtractionForm from '../components/ExtractionForm'
import './DocumentView.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function DocumentView() {
  const { id } = useParams()
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('data') // 'data' or 'preview'

  useEffect(() => {
    async function fetchDoc() {
      try {
        const res = await fetch(`${API_URL}/documents/${id}/extraction`)
        if (!res.ok) throw new Error('Failed to fetch document details')
        const data = await res.json()
        setDoc(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchDoc()
  }, [id])

  if (loading) return <div className="doc-view-loading">Loading...</div>
  if (error) return <div className="doc-view-error">Error: {error}</div>
  if (!doc) return <div className="doc-view-error">Document not found</div>

  const fileUrl = doc.file_path ? `${API_URL}/${doc.file_path.replace(/\\/g, '/')}` : null;
  const isImage = doc.mime_type?.startsWith('image/')

  return (
    <div className="doc-view-page">
      <div className="doc-view-header">
        <div>
          <Link to="/dashboard" className="back-link">&larr; Back to Dashboard</Link>
          <h2>{doc.original_filename}</h2>
          <span className="doc-meta">Type: {doc.document_type || 'Unknown'} | Status: {doc.status}</span>
        </div>
      </div>

      <div className="doc-view-tabs">
        <button 
          className={`tab-button ${activeTab === 'data' ? 'active' : ''}`}
          onClick={() => setActiveTab('data')}
        >
          Extracted Data
        </button>
        <button 
          className={`tab-button ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => setActiveTab('preview')}
        >
          Original Document
        </button>
      </div>

      <div className="doc-view-content">
        {activeTab === 'preview' && (
          <div className="doc-preview">
            {fileUrl ? (
              isImage ? (
                <img src={fileUrl} alt={doc.original_filename} className="preview-media" />
              ) : (
                <object data={fileUrl} type="application/pdf" className="preview-media">
                  <p>Unable to display PDF. <a href={fileUrl} target="_blank" rel="noreferrer">Download instead.</a></p>
                </object>
              )
            ) : (
              <div className="no-preview">No file attached</div>
            )}
          </div>
        )}

        {activeTab === 'data' && (
          <div className="doc-data doc-data-scrollable">
            {doc.extraction ? (
              <ExtractionForm documentId={id} initialData={doc.extraction.extracted_data} />
            ) : (
              <div className="no-data">
                <p>No extraction data found for this document.</p>
                {doc.status === 'processing' && <p>The document is still being processed.</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default DocumentView
