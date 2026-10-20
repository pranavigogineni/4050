import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { accountApi } from '../api/account'
import { Field, ProfileFields, PasswordFields, CardFields, Notice, emptyProfile, emptyCard } from '../components/AccountFields'
import Poster from '../components/Poster'
import './AccountPages.css'

function Cards() {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function load() {
    try { setCards(await accountApi('/account/cards')); setError('') } catch (e) { setError(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  async function save(e) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const data = await accountApi(`/account/cards${editing ? `/${editing}` : ''}`, { method: editing ? 'PUT' : 'POST', body: form })
      setForm(null); setEditing(null); setMessage(data.message); await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function remove(card) {
    if (!window.confirm(`Remove the card ending in ${card.last_four || '••••'}?`)) return
    setBusy(true); setError(''); setMessage('')
    try {
      setMessage((await accountApi(`/account/cards/${card.id}`, { method: 'DELETE' })).message)
      await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <section className="account-panel" id="payment-cards">
    <h2>Payment cards <span className="count-pill">{cards.length} / 3</span></h2>
    <p className="form-help">Save up to three cards. Adding a card does not charge it.</p>
    <Notice error={error} message={message} />
    {error && <button className="btn-ghost" type="button" onClick={load}>Retry loading cards</button>}
    {loading ? <p role="status">Loading cards…</p> : <>
      {!cards.length && !error && <p className="empty-note">No payment cards saved yet.</p>}
      <div className="saved-cards">{cards.map(card => <div className="saved-card" key={card.id}>
        <div><strong>•••• {card.last_four || '••••'}</strong><p>{card.card_holder_name}</p><p>Expires {card.expiration}</p></div>
        <div className="inline-actions"><button className="btn-ghost" disabled={busy} onClick={() => { setEditing(card.id); setForm({ ...emptyCard, ...card, card_number: '' }); setMessage(''); setError('') }}>Edit</button>
          <button className="text-button" disabled={busy} onClick={() => remove(card)}>Remove</button></div>
      </div>)}</div>
      {!form && <button className="btn-ghost" disabled={cards.length >= 3 || busy} onClick={() => { setEditing(null); setForm({ ...emptyCard }); setMessage('') }}>Add payment card</button>}
      {cards.length >= 3 && !form && <p className="form-help">You’ve reached the three-card limit. You can edit or remove an existing card.</p>}
    </>}
    {form && <form onSubmit={save}><h3>{editing ? 'Edit payment card' : 'New payment card'}</h3>
      {editing && <p className="form-help">For your security, enter the full card number again.</p>}
      <CardFields value={form} setValue={setForm} />
      <div className="inline-actions"><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save card'}</button>
        <button className="btn-ghost" type="button" disabled={busy} onClick={() => { setForm(null); setEditing(null) }}>Cancel</button></div>
    </form>}
  </section>
}
function Favorites() {
  const { favorites, toggleFavorite, favoritesLoading: loading, favoritesError, refreshFavorites } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  async function remove(movie) {
    setBusy(movie.id); setError('')
    try { await toggleFavorite(movie) } catch (e) { setError(e.message) } finally { setBusy(null) }
  }
  return <section className="account-panel" id="favorites">
    <h2>Your favorite movies</h2><p className="form-help">Tap the heart while browsing to save a movie here.</p>
    <Notice error={error || favoritesError} />
    {favoritesError && <button className="btn-ghost" onClick={refreshFavorites}>Retry favorites</button>}
    {loading ? <p role="status">Loading favorites…</p> : favoritesError ? null : favorites.length ? <div className="favorite-list">
      {favorites.map(movie => <div className="favorite-row" key={movie.id}>
        <Link to={`/movie/${movie.id}`}><Poster src={movie.poster} alt={movie.title} /></Link>
        <div><Link to={`/movie/${movie.id}`}>{movie.title}</Link><p className="form-help">{movie.rating}</p></div>
        <button className="text-button" disabled={busy !== null} aria-label={`Remove ${movie.title} from favorites`} onClick={() => remove(movie)}>Remove</button>
      </div>)}
    </div> : <div className="empty-note"><p>Your favorites are waiting for their first movie.</p><Link to="/">Browse movies →</Link></div>}
  </section>
}
export default function ProfilePage() {
  const { user, setUser, setFavorites, setNotice } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(() => Object.fromEntries(Object.keys(emptyProfile).map(key => [key, user[key] ?? emptyProfile[key]])))
  const [passwords, setPasswords] = useState({ current_password: '', password: '', confirm_password: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [busy, setBusy] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  async function save(e) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const data = await accountApi('/account', { method: 'PUT', body: form })
      setUser(data.user); setMessage(data.message)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function changePassword(e) {
    e.preventDefault(); setPasswordBusy(true); setPasswordError('')
    try {
      const data = await accountApi('/account/password', { method: 'POST', body: passwords })
      setNotice(data.message)
      setUser(null); setFavorites([])
      navigate('/login', { replace: true, state: { message: data.message } })
    } catch (e) { setPasswordError(e.message) } finally { setPasswordBusy(false) }
  }
  return <main className="account-page">
    <div className="account-heading"><span className="eyebrow">YOUR CINEMAX</span><h1>Your profile.</h1><p>A little about you. A lot to look forward to.</p></div>
    <div className="profile-layout"><div>
      <section className="account-panel"><h2>Personal information</h2><Notice error={error} message={message} />
        <form onSubmit={save}><p className="form-help">Fields marked * are required.</p>
          <Field name="email" label="Email address" type="email" value={user.email} readOnly onChange={() => {}} />
          <p className="form-help">Your verified email address cannot be changed.</p>
          <ProfileFields value={form} setValue={setForm} />
          <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
        </form>
      </section>
      {user.role === 'customer' && <Cards />}
      <section className="account-panel"><h2>Change password</h2><Notice error={passwordError} />
        <form onSubmit={changePassword}><PasswordFields current value={passwords} setValue={setPasswords} />
          <p className="form-help">You’ll be logged out on all devices after changing your password.</p>
          <button className="btn-primary" disabled={passwordBusy}>{passwordBusy ? 'Updating…' : 'Change password'}</button>
        </form>
      </section>
    </div><aside>{user.role === 'customer' ? <Favorites /> : <section className="account-panel"><h2>Administrator</h2><Link to="/admin">Open admin portal →</Link></section>}</aside></div>
  </main>
}
