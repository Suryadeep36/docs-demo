import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import UploadView from './pages/UploadView'
import Dashboard from './pages/Dashboard'
import DocumentView from './pages/DocumentView'

import './App.css'

function App() {
  return (
    <BrowserRouter>
      <div className="app-wrapper">
        <header className="app-header">
          <div className="logo">
            <strong>ADE</strong>
            <span>Academic Extractor</span>
          </div>
          <nav>
            <Link to="/">Upload New</Link>
            <Link to="/dashboard">Dashboard</Link>
          </nav>
        </header>

        <Routes>
          <Route path="/" element={<UploadView />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/:id" element={<DocumentView />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
