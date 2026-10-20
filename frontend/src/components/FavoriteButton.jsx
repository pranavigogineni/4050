import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function FavoriteButton({ movie }) {
  const { user, favorites, toggleFavorite, loading, favoritesLoading, favoritesError, refreshFavorites } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  if (user?.role === 'admin') return null
  const saved = favorites.some(item => item.id === movie.id)
  const label = saved ? `Remove ${movie.title} from favorites` : `Add ${movie.title} to favorites`
  async function click(e) {
    e.stopPropagation(); setError('')
    if (!user) { navigate('/login', { state: { from: location.pathname } }); return }
    setBusy(true)
    try { await toggleFavorite(movie) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <div className="favorite-control" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    <button className={`favorite-button ${saved ? 'saved' : ''}`} type="button" title={label} aria-label={label} aria-pressed={saved} disabled={busy || loading || favoritesLoading || Boolean(favoritesError)} onClick={click}>
      <span aria-hidden="true">{saved ? '♥' : '♡'}</span><span>{saved ? 'Saved' : 'Favorite'}</span>
    </button>
    {error && <p className="favorite-error" role="alert">{error}</p>}
    {favoritesError && <button type="button" className="text-button" title={favoritesError} onClick={refreshFavorites}>Retry favorites</button>}
  </div>
}
