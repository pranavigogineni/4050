import { useEffect, useState } from 'react'
import { accountApi } from '../api/account'
import { Notice } from '../components/AccountFields'
import './AccountPages.css'

export default function AdminPage() {
  const [sections, setSections] = useState([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    accountApi('/admin').then(data => setSections(data.sections)).catch(e => setError(e.message))
  }, [])
  return <main className="account-page">
    <div className="account-heading"><span className="eyebrow">CINEMAX ADMINISTRATION</span><h1>Admin portal.</h1><p>Your cinema, at a glance.</p></div>
    <Notice error={error} />
    <nav className="admin-menu" aria-label="Admin menu">{sections.map((section, i) =>
      <button key={section} className={`account-panel admin-tile ${selected === section ? 'selected' : ''}`} onClick={() => setSelected(section)}>
        <span className="eyebrow">0{i + 1}</span><h2>{section}</h2><span>Open workspace →</span>
      </button>)}</nav>
    <section className="account-panel"><h2>{selected || 'Welcome to your workspace'}</h2>
      <p className="form-help">{selected ? `${selected} is a prototype workspace for the Sprint 2 demonstration. Management actions will be added in a later sprint.` : 'Choose an option from the admin menu. This Sprint 2 portal demonstrates role-based navigation.'}</p>
    </section>
  </main>
}
