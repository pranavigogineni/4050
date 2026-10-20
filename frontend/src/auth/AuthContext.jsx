import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { accountApi } from '../api/account'

const Context = createContext(null)
export const useAuth = () => useContext(Context)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [favorites, setFavorites] = useState([])
  const [favoritesLoading, setFavoritesLoading] = useState(false)
  const [favoritesError, setFavoritesError] = useState('')
  const favoriteRequest = useRef(0)
  async function refresh() {
    setError('')
    try {
      const data = await accountApi('/account')
      setUser(data.user)
    } catch (e) {
      setUser(null)
      if (e.status !== 401) setError(e.message)
    } finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])
  const refreshFavorites = useCallback(async () => {
    const request = ++favoriteRequest.current
    if (user?.role !== 'customer') { setFavoritesLoading(false); return }
    setFavoritesLoading(true)
    setFavoritesError('')
    try {
      const data = await accountApi('/account/favorites')
      if (request === favoriteRequest.current) setFavorites(data)
    } catch (e) {
      if (request === favoriteRequest.current) setFavoritesError(e.message)
    } finally {
      if (request === favoriteRequest.current) setFavoritesLoading(false)
    }
  }, [user?.id, user?.role])
  useEffect(() => {
    setFavorites([])
    setFavoritesError('')
    refreshFavorites()
    return () => { favoriteRequest.current++ }
  }, [refreshFavorites])
  async function logout() {
    await accountApi('/auth/logout', { method: 'POST' })
    setNotice('You have been logged out.')
    setUser(null)
    setFavorites([])
  }
  async function toggleFavorite(movie) {
    if (favoritesLoading || favoritesError) throw new Error('Reload your favorites before making changes.')
    const exists = favorites.some(item => item.id === movie.id)
    await accountApi(`/account/favorites/${movie.id}`, { method: exists ? 'DELETE' : 'PUT' })
    setFavorites(current => exists ? current.filter(item => item.id !== movie.id)
      : [...current.filter(item => item.id !== movie.id), movie])
  }
  return <Context.Provider value={{ user, setUser, loading, error, refresh, logout, notice, setNotice, favorites, setFavorites, toggleFavorite, favoritesLoading, favoritesError, refreshFavorites }}>{children}</Context.Provider>
}
export function Protected({ children, admin = false }) {
  const { user, loading, error, refresh } = useAuth()
  const location = useLocation()
  if (loading) return <p className="account-page" role="status">Loading your account…</p>
  if (error) return <div className="account-page" role="alert">{error} <button className="btn-ghost" onClick={refresh}>Try again</button></div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />
  return children
}
