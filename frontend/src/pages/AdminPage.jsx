import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { accountApi } from '../api/account'
import { Field, Notice } from '../components/AccountFields'
import './AccountPages.css'
import PromotionPanel from './PromotionPanel'

const emptyMovie = { title: '', cast_members: '', director: '', producer: '', synopsis: '', poster_image_url: '', trailer_video_url: '', release_date: '', rating: 'PG_13', status: 'NOW_PLAYING', genre_ids: [] }
function Select({ label, value, onChange, children }) {
  return <label className="account-field"><span>{label} *</span><select aria-label={label} required value={value} onChange={e => onChange(e.target.value)}>{children}</select></label>
}
export default function AdminPage() {
  const [catalog, setCatalog] = useState(null)
  const [selected, setSelected] = useState('Manage Movies')
  const [movie, setMovie] = useState(emptyMovie)
  const [show, setShow] = useState({ movie_id: '', show_date: '', show_time: '', duration: '120', showroom_id: '' })
  const [rooms, setRooms] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [created, setCreated] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = () => accountApi('/admin/catalog').then(setCatalog)
  useEffect(() => { load().catch(e => setError(e.message)) }, [])
  function changeShow(key, value) {
    setShow(prev => ({ ...prev, [key]: value, ...(key !== 'showroom_id' ? { showroom_id: '' } : {}) }))
    if (key !== 'showroom_id') setRooms(null)
    setMessage(''); setError('')
  }
  async function perform(action) {
    setBusy(true); setError(''); setMessage('')
    try { await action() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  function addMovie(e) {
    e.preventDefault()
    if (!movie.genre_ids.length) { setError('Choose at least one genre.'); return }
    perform(async () => {
      const result = await accountApi('/admin/movies', { method: 'POST', body: movie })
      setCreated(result); setMovie(emptyMovie); setMessage(`${result.title} was added to the catalog.`)
      await load(); setShow(prev => ({ ...prev, movie_id: String(result.id) })); setRooms(null)
    })
  }
  function schedule(e) {
    e.preventDefault()
    perform(async () => {
      if (rooms === null) {
        setRooms(await accountApi('/admin/available-showrooms', { method: 'POST', body: show }))
      } else {
        await accountApi('/admin/shows', { method: 'POST', body: { ...show, movie_id: Number(show.movie_id), showroom_id: Number(show.showroom_id), duration: Number(show.duration) } })
        setMessage('Showtime scheduled. It is now visible in the movie catalog.'); setRooms(null); setShow(prev => ({ ...prev, showroom_id: '' }))
      }
    })
  }
  return <main className="account-page">
    <div className="account-heading"><span className="eyebrow">CINEMAX ADMINISTRATION</span><h1>Admin portal.</h1><p>Manage the catalog and plan the next screening.</p></div>
    <nav className="admin-menu" aria-label="Admin menu">{['Manage Movies', 'Manage Promotions', 'Manage Users', 'Manage Showtimes'].map((section, i) =>
      <button key={section} className={`account-panel admin-tile ${selected === section ? 'selected' : ''}`} onClick={() => { setSelected(section); setError(''); setMessage('') }}><span className="eyebrow">0{i + 1}</span><h2>{section}</h2><span>Open workspace →</span></button>)}</nav>
    <Notice error={error} message={message} />
    {!catalog ? <button className="btn-primary" onClick={() => perform(load)}>Retry loading catalog</button> : <section className="account-panel">
      <h2>{selected}</h2>
      {selected === 'Manage Movies' && <>
        {created && <p className="form-links"><Link to={`/movie/${created.id}`}>View {created.title}</Link><button className="btn-primary" onClick={() => setSelected('Manage Showtimes')}>Schedule this movie</button></p>}
        <form onSubmit={addMovie}><p className="form-help">Fields marked * are required. Separate cast names with commas.</p><div className="form-grid">
          {[['title', 'Title'], ['cast_members', 'Cast'], ['director', 'Director'], ['producer', 'Producer'], ['poster_image_url', 'Poster URL'], ['trailer_video_url', 'Trailer URL']].map(([key, label]) => <Field key={key} name={key} label={label} required maxLength={key.includes('url') || key === 'cast_members' ? 2000 : 200} type={key.includes('url') ? 'url' : 'text'} value={movie[key]} onChange={v => setMovie({ ...movie, [key]: v })} />)}
          <Field label="Release date" type="date" value={movie.release_date} onChange={v => setMovie({ ...movie, release_date: v })} />
          <Select label="Rating" value={movie.rating} onChange={v => setMovie({ ...movie, rating: v })}>{['G', 'PG', 'PG_13', 'R', 'NC_17'].map(r => <option key={r} value={r}>{r.replace('_', '-')}</option>)}</Select>
          <Select label="Movie status" value={movie.status} onChange={v => setMovie({ ...movie, status: v })}><option value="NOW_PLAYING">Now Showing</option><option value="COMING_SOON">Coming Soon</option></Select>
        </div>
        <label className="account-field"><span>Synopsis *</span><textarea aria-label="Synopsis" required maxLength={5000} rows={4} value={movie.synopsis} onChange={e => setMovie({ ...movie, synopsis: e.target.value })} /></label>
        <fieldset><legend>Genres *</legend>{catalog.genres.map(g => <label key={g.id} className="check-field"><input type="checkbox" checked={movie.genre_ids.includes(g.id)} onChange={e => setMovie({ ...movie, genre_ids: e.target.checked ? [...movie.genre_ids, g.id] : movie.genre_ids.filter(id => id !== g.id) })} />{g.name}</label>)}</fieldset>
        <p className="form-help">Use HTTPS media URLs. Trailer format: https://www.youtube.com/embed/VIDEO_ID</p>
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Add movie'}</button></form>
      </>}
      {selected === 'Manage Showtimes' && <form onSubmit={schedule}><p className="form-help">All times are in America/New_York. Duration includes any turnover time you need between screenings. Fields marked * are required.</p>
        <Select label="Movie" value={show.movie_id} onChange={v => changeShow('movie_id', v)}><option value="">Choose a movie</option>{catalog.movies.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</Select>
        <div className="form-grid"><Field label="Show date" type="date" required value={show.show_date} onChange={v => changeShow('show_date', v)} /><Field label="Show time" type="time" required value={show.show_time} onChange={v => changeShow('show_time', v)} /><Field label="Duration in minutes" type="number" min={1} max={600} step={1} required value={show.duration} onChange={v => changeShow('duration', v)} /></div>
        {rooms !== null && (rooms.length ? <Select label="Available showroom" value={show.showroom_id} onChange={v => changeShow('showroom_id', v)}><option value="">Choose a showroom</option>{rooms.map(r => <option key={r.id} value={r.id}>{r.name} · {r.seat_capacity} seats</option>)}</Select> : <p role="status">No showrooms are available for that interval. Change the time or duration.</p>)}
        <button className="btn-primary" disabled={busy || rooms?.length === 0}>{busy ? 'Checking…' : rooms === null ? 'Find available showrooms' : 'Confirm showtime'}</button>
      </form>}
      {selected === 'Manage Promotions' && <PromotionPanel />}
      {selected === 'Manage Users' && <p className="form-help">User management is not part of this sprint. Account registration and profile management are available through the customer portal.</p>}
    </section>}
  </main>
}
