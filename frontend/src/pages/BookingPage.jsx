import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { accountApi } from '../api/account'
import LoadError from '../components/LoadError'
import Poster from '../components/Poster'
import './BookingPage.css'

export const draftKey = showId => `cinemax-booking-${showId}`
export function readDraft(showId) {
  try {
    const draft = JSON.parse(sessionStorage.getItem(draftKey(showId)))
    if (!draft || !Array.isArray(draft.selected) || !draft.qty || typeof draft.qty !== 'object') return {}
    if (draft.selected.length > 1000 || draft.selected.some(id => !Number.isInteger(id) || id < 1) ||
        Object.values(draft.qty).some(n => !Number.isInteger(n) || n < 0 || n > 1000)) return {}
    return draft
  } catch { return {} }
}
export default function BookingPage() {
  const { id, showtime } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(() => readDraft(showtime).selected || [])
  const [qty, setQty] = useState(() => readDraft(showtime).qty || {})
  const [notice, setNotice] = useState('')
  function load() {
    setError('')
    if (!/^[1-9]\d*$/.test(showtime)) { setError('This showtime is not available. Please select a listed showtime.'); return }
    accountApi(`/shows/${showtime}/seats`).then(result => {
      if (result.show.movie_id !== Number(id)) throw new Error('This showtime is not available for this movie.')
      setData(result)
      setSelected(prev => prev.filter(id => result.seats.some(s => s.id === id && !s.booked)))
    }).catch(e => setError(e.message))
  }
  useEffect(load, [id, showtime])
  useEffect(() => {
    try { sessionStorage.setItem(draftKey(showtime), JSON.stringify({ selected, qty })) }
    catch { setNotice('Browser session storage is unavailable. Enable it to keep your seats through login.') }
  }, [selected, qty, showtime])
  if (error) return <LoadError message={error} retry={load} />
  if (!data) return <div className="spinner-wrap" role="status"><div className="spinner" /></div>
  const { show, seats, ticket_types: types } = data
  const capacity = seats.filter(s => !s.booked).length
  const totalTix = types.reduce((sum, t) => sum + (qty[t.id] || 0), 0)
  const total = types.reduce((sum, t) => sum + (qty[t.id] || 0) * Math.round(Number(t.price) * 100), 0) / 100
  const rows = [...new Set(seats.map(s => s.row_label))]
  function proceed() {
    const typeIds = types.flatMap(t => Array(qty[t.id] || 0).fill(t.id))
    const tickets = selected.map((seat_id, index) => ({ seat_id, ticket_type_id: typeIds[index] }))
    try {
      sessionStorage.setItem(draftKey(showtime), JSON.stringify({ selected, qty, show_id: show.id, tickets }))
      navigate(`/checkout/${show.id}`)
    } catch { setNotice('Enable browser session storage to continue checkout.') }
  }
  return <main className="booking-page">
    <div className="booking-hdr glass"><button className="back-btn" onClick={() => navigate(`/movie/${id}`)}>← Back to Movie</button>
      <div className="booking-hdr-row"><Poster className="booking-thumb" src={show.poster} alt={show.title} /><div><h1 className="booking-ttl">{show.title}</h1><div className="booking-meta">{show.date} · {show.time.slice(0, 5)} · {show.showroom} · Eastern Time</div></div></div>
    </div>
    {notice && <p role="alert">{notice}</p>}
    <p className="prototype-note">Your selection stays in this browser tab while you log in and review your order.</p>
    <div className="booking-body"><section className="seat-section" aria-label="Choose seats"><div className="screen-label">Screen</div><div className="screen-bar" />
      <div className="seat-scroll" tabIndex={0} aria-label="Seat map; scroll horizontally on small screens"><div className="seat-rows">{rows.map(row => <div className="seat-row" key={row}><div className="row-lbl">{row}</div>{seats.filter(s => s.row_label === row).map(s => <button key={s.id} className={`seat ${s.booked ? 'taken' : ''} ${selected.includes(s.id) ? 'sel' : ''}`} disabled={s.booked} aria-pressed={selected.includes(s.id)} aria-label={s.booked ? `Seat ${row}${s.seat_number} unavailable` : `Select seat ${row}${s.seat_number}`} onClick={() => setSelected(prev => prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id])}>{s.seat_number}</button>)}</div>)}</div></div>
      <div className="seat-legend"><div className="leg-item"><div className="leg-sw leg-avail" />Available</div><div className="leg-item"><div className="leg-sw leg-sel" />Selected ({selected.length})</div><div className="leg-item"><div className="leg-sw leg-taken" />Booked</div></div>
    </section><section className="tpanel glass"><h2 className="tpanel-ttl">Your Tickets</h2>
      {types.map(t => <div className="t-row" key={t.id}><div><div className="t-lbl">{t.name}</div><div className="t-pr">${Number(t.price).toFixed(2)} each</div><div className="t-hint">{t.age_criteria}</div></div><div className="qty-ctrl"><button className="qbtn" aria-label={`Decrease ${t.name} tickets`} disabled={!qty[t.id]} onClick={() => setQty({ ...qty, [t.id]: qty[t.id] - 1 })}>−</button><span className="qv">{qty[t.id] || 0}</span><button className="qbtn" aria-label={`Increase ${t.name} tickets`} disabled={totalTix >= capacity} onClick={() => setQty({ ...qty, [t.id]: (qty[t.id] || 0) + 1 })}>+</button></div></div>)}
      <div className="seats-smry"><div className="smry-lbl">Selected seats</div><div className="smry-list">{selected.map(id => seats.find(s => s.id === id)).filter(Boolean).map(s => `${s.row_label}${s.seat_number}`).join(' · ') || 'No seats selected yet'}</div></div>
      <div className="order-total"><span className="ot-lbl">Before tax</span><span className="ot-amt">${total.toFixed(2)}</span></div>
      <button className="ck-btn" disabled={!totalTix || totalTix !== selected.length} onClick={proceed}>Proceed to Checkout</button>
      <p className="ck-note" aria-live="polite">Select one ticket for each seat ({totalTix} tickets, {selected.length} seats).</p>
    </section></div>
  </main>
}
