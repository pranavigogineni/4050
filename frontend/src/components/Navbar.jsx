import { useNavigate, useLocation } from 'react-router-dom'
import './Navbar.css'

export default function Navbar() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const onHome    = location.pathname === '/'

  const goMovies = () => {
    navigate('/')
    // small delay so the page mounts before scrolling
    setTimeout(() => {
      document.querySelector('.controls-bar')?.scrollIntoView({ behavior: 'smooth' })
    }, 80)
  }

  return (
    <nav className="navbar">
      <div className="logo" onClick={() => navigate('/')}>
        <div className="logo-dot" />
        CineMax
      </div>

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
      </div>
    </nav>
  )
}
