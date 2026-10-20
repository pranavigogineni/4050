import { useNavigate, useLocation } from 'react-router-dom'
import './Navbar.css'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'

export default function Navbar() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const onHome    = location.pathname === '/'
  const { user, logout, loading } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function signOut() {
    setBusy(true); setError('')
    try { await logout(); navigate('/login', { state: { message: 'You have been logged out.' } }) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const goMovies = () => {
    navigate('/')
    // small delay so the page mounts before scrolling
    setTimeout(() => {
      document.querySelector('.controls-bar')?.scrollIntoView({ behavior: 'smooth' })
    }, 80)
  }

  return (
    <nav className="navbar">
      <button aria-label="CineMax home" className="logo" onClick={() => navigate('/')}>
        <div className="logo-dot" />
        CineMax
      </button>

      <div className="nav-links">
        <button
          className={`nav-link ${onHome ? 'active' : ''}`}
          onClick={() => navigate('/')}
        >
          Home
        </button>
        <button className="nav-link" onClick={goMovies}>
          Movies
        </button>
        {!loading && (user ? <>
          {user.role === 'admin' && <button className="nav-link" onClick={() => navigate('/admin')}>Admin</button>}
          <button className="nav-link" onClick={() => navigate('/profile')}>My profile</button>
          <button className="nav-link" onClick={signOut} disabled={busy}>{busy ? 'Logging out…' : 'Log out'}</button>
        </> : <>
          <button className="nav-link" onClick={() => navigate('/login')}>Log in</button>
          <button className="nav-link" onClick={() => navigate('/register')}>Sign up</button>
        </>)}
      </div>
      {error && <p className="nav-error" role="alert">{error}</p>}
    </nav>
  )
}
