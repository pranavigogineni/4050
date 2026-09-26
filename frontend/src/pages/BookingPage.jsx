import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useMovie from '../hooks/useMovie'
import LoadError from '../components/LoadError'
import Poster from '../components/Poster'
import './BookingPage.css'

const ROWS  = ['A','B','C','D','E','F','G']
const COLS  = 10
const PRICES = { adult: 12.99, child: 8.99, senior: 9.99 }

// Deterministic taken seats based on movie id (so they're consistent)
function getInitialTaken(movieId, showtime) {
  const taken = new Set()
  const seed = parseInt(movieId) * 31 + [...showtime].reduce((sum, c) => sum + c.charCodeAt(0), 0)
  ROWS.forEach((row, ri) => {
    for (let c = 1; c <= COLS; c++) {
      if (((ri * 13 + c * 7 + seed) % 100) < 27) taken.add(`${row}${c}`)
    }
  })
  return taken
}

export default function BookingPage() {
  const { id, showtime } = useParams()
  const navigate         = useNavigate()
  const time             = showtime

  const { movie, loading, error, retry } = useMovie(id)
  const [selected, setSelected] = useState(new Set())
  const [qty, setQty] = useState({ adult: 0, child: 0, senior: 0 })
  const [secs, setSecs] = useState(300)
  const [deadline, setDeadline] = useState(null)
  const [notice, setNotice] = useState('')
  const taken = useMemo(() => getInitialTaken(id, time), [id, time])
  const capacity = ROWS.length * COLS - taken.size

  // Local prototype timer only; no server-side seat reservation is made.
  useEffect(() => {
    if (deadline === null) return
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setSecs(remaining)
      if (remaining === 0) {
        setDeadline(null)
        setSelected(new Set())
        setQty({ adult: 0, child: 0, senior: 0 })
        setNotice('Your selection time expired. Please select seats and tickets again.')
        setSecs(300)
      }
    }
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [deadline])

  const toggleSeat = (sid) => {
    if (taken.has(sid)) return
    setNotice('')
    if (deadline === null) { setDeadline(Date.now() + 300000); setSecs(300) }
    setSelected(prev => {
      const next = new Set(prev)
      next.has(sid) ? next.delete(sid) : next.add(sid)
      return next
    })
  }

  const changeQty = (type, delta) => {
    setNotice('')
    setQty(prev => {
      if (delta > 0 && prev.adult + prev.child + prev.senior >= capacity) return prev
      return { ...prev, [type]: Math.max(0, prev[type] + delta) }
    })
  }

  const total       = qty.adult * PRICES.adult + qty.child * PRICES.child + qty.senior * PRICES.senior
  const totalTix    = qty.adult + qty.child + qty.senior
  const canCheckout = totalTix > 0 && totalTix === selected.size

  const mm = Math.floor(secs / 60)
  const ss = String(secs % 60).padStart(2, '0')
  const urgent = secs <= 60

  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>
  if (error) return <LoadError message={error} retry={retry} />
  if (!movie) return null
  if (!movie.showtimes.includes(time)) return <LoadError message="This showtime is not available. Please select a listed showtime." />

  return (
    <div className="booking-page">
      {/* ── HEADER ── */}
      <div className="booking-hdr glass">
        <button className="back-btn" onClick={() => navigate(`/movie/${id}`)}>
          ← Back to Movie
        </button>
        <div className="booking-hdr-row">
          <Poster
            className="booking-thumb"
            src={movie.poster}
            alt={movie.title}
          />
          <div>
            <div className="booking-ttl">{movie.title}</div>
            <div className="booking-meta">
              <span>🕐 {time}</span>
              <span>·</span>
              <span className="tag tag-genre">{movie.genre}</span>
              <span className="tag tag-rating">{movie.rating}</span>
            </div>
          </div>
          {/* countdown timer */}
          <div className={`timer-chip ${urgent ? 'urgent' : ''}`}>
            ⏱ {mm}:{ss}{deadline === null ? ' · starts with seat selection' : ''}
          </div>
        </div>
      </div>

      {notice && <p className="booking-notice" role="status">{notice}</p>}
      <p className="prototype-note">Booking preview: seats are illustrative and are not reserved.</p>

      {/* ── BODY ── */}
      <div className="booking-body">
        {/* SEAT MAP */}
        <div className="seat-section">
          <div className="screen-label">Screen</div>
          <div className="screen-bar" />

          <div className="seat-scroll" tabIndex={0} aria-label="Seat map; scroll horizontally on small screens">
          <div className="col-labels">
            <div />
            {Array.from({ length: COLS }, (_, i) => (
              <div key={i} className="col-lbl">{i + 1}</div>
            ))}
          </div>

          <div className="seat-rows">
            {ROWS.map(row => (
              <div key={row} className="seat-row">
                <div className="row-lbl">{row}</div>
                {Array.from({ length: COLS }, (_, ci) => {
                  const sid = `${row}${ci + 1}`
                  const isTaken    = taken.has(sid)
                  const isSelected = selected.has(sid)
                  return (
                    <button
                      key={sid}
                      className={`seat ${isTaken ? 'taken' : ''} ${isSelected ? 'sel' : ''}`}
                      onClick={() => toggleSeat(sid)}
                      disabled={isTaken}
                      aria-pressed={isSelected}
                      title={isTaken ? 'Unavailable' : sid}
                      aria-label={isTaken ? `Seat ${sid} unavailable` : `Select seat ${sid}`}
                    />
                  )
                })}
              </div>
            ))}
          </div>

          </div>
          <div className="seat-legend">
            <div className="leg-item">
              <div className="leg-sw leg-avail" />
              Available
            </div>
            <div className="leg-item">
              <div className="leg-sw leg-sel" />
              Selected ({selected.size})
            </div>
            <div className="leg-item">
              <div className="leg-sw leg-taken" />
              Unavailable
            </div>
          </div>
        </div>

        {/* TICKET PANEL */}
        <div className="tpanel glass">
          <h3 className="tpanel-ttl">Your Tickets</h3>

          {[
            { key: 'adult',  label: 'Adult',  price: PRICES.adult,  hint: 'Ages 12–64' },
            { key: 'child',  label: 'Child',  price: PRICES.child,  hint: 'Under 12' },
            { key: 'senior', label: 'Senior', price: PRICES.senior, hint: 'Ages 65+' },
          ].map(({ key, label, price, hint }) => (
            <div className="t-row" key={key}>
              <div>
                <div className="t-lbl">{label}</div>
                <div className="t-pr">${price.toFixed(2)} each</div>
                <div className="t-hint">{hint}</div>
              </div>
              <div className="qty-ctrl">
                <button className="qbtn" aria-label={`Decrease ${label} tickets`} disabled={qty[key] === 0} onClick={() => changeQty(key, -1)}>−</button>
                <span className="qv">{qty[key]}</span>
                <button className="qbtn" aria-label={`Increase ${label} tickets`} disabled={totalTix >= capacity} onClick={() => changeQty(key, 1)}>+</button>
              </div>
            </div>
          ))}

          {/* selected seats summary */}
          <div className="seats-smry">
            {selected.size > 0 ? (
              <>
                <div className="smry-lbl">Selected seats</div>
                <div className="smry-list">{[...selected].sort().join(' · ')}</div>
              </>
            ) : (
              <div className="smry-empty">No seats selected yet</div>
            )}
          </div>

          {/* total */}
          <div className="order-total">
            <div className="ot-lbl">Total</div>
            <div className="ot-amt">${total.toFixed(2)}</div>
          </div>

          <button
            className="ck-btn"
            disabled={!canCheckout}
            onClick={() => setNotice('Selection complete. Checkout will be available in a later release; no seats have been reserved or purchased.')}
          >
            Preview booking
          </button>
          <p className="ck-note" aria-live="polite">{canCheckout
            ? 'Your ticket and seat counts match.'
            : `Select one ticket for each seat (${totalTix} tickets, ${selected.size} seats).`}</p>
          <p className="ck-note">Checkout is not available in this prototype.</p>
        </div>
      </div>
    </div>
  )
}
