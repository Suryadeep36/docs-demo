import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './Dashboard.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function Dashboard() {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchDocuments() {
      try {
        const res = await fetch(`${API_URL}/documents`)
        if (!res.ok) throw new Error('Failed to fetch documents')
        const data = await res.json()
        setDocuments(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchDocuments()
  }, [])

  if (loading) return <div className="dashboard-loading">Loading documents...</div>
  if (error) return <div className="dashboard-error">Error: {error}</div>

  return (
    <main className="app">
      <section className="container dashboard-container">
        <h1>Dashboard</h1>
        <p className="subtext">View all saved documents and extractions.</p>

        {documents.length === 0 ? (
          <p className="empty-state">No documents found. Upload one to get started.</p>
        ) : (
          <div className="table-wrapper">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.original_filename}</td>
                    <td>{doc.document_type || '-'}</td>
                    <td>
                      <span className={`status-badge status-${doc.status.toLowerCase()}`}>
                        {doc.status}
                      </span>
                    </td>
                    <td>{new Date(doc.created_at).toLocaleString()}</td>
                    <td>
                      <Link to={`/dashboard/${doc.id}`} className="view-link">
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

export default Dashboard
