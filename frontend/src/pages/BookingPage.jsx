import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchMovie } from '../api/movies'
import './BookingPage.css'

const ROWS  = ['A','B','C','D','E','F','G']
const COLS  = 10
const PRICES = { adult: 12.99, child: 8.99, senior: 9.99 }

// Deterministic taken seats based on movie id (so they're consistent)
function getInitialTaken(movieId) {
  const taken = new Set()
  const seed  = parseInt(movieId) * 31
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
  const time             = decodeURIComponent(showtime)

  const [movie,    setMovie]    = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [qty,      setQty]      = useState({ adult: 0, child: 0, senior: 0 })
  const [secs,     setSecs]     = useState(300)  // 5-min countdown
  const timerRef = useRef(null)

  const taken = useMemo(() => getInitialTaken(id), [id])

  useEffect(() => {
    fetchMovie(id)
      .then(data => { setMovie(data); setLoading(false) })
      .catch(() => navigate('/'))
  }, [id])

  // 5-minute timer per US-3.1
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecs(s => {
        if (s <= 1) {
          clearInterval(timerRef.current)
          alert('Your seat reservation has expired. Please select seats again.')
          setSelected(new Set())
          return 300
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  const toggleSeat = (sid) => {
    if (taken.has(sid)) return
    setSelected(prev => {
      const next = new Set(prev)
      next.has(sid) ? next.delete(sid) : next.add(sid)
      return next
    })
  }

  const changeQty = (type, delta) => {
    setQty(prev => ({ ...prev, [type]: Math.max(0, prev[type] + delta) }))
  }

  const total       = qty.adult * PRICES.adult + qty.child * PRICES.child + qty.senior * PRICES.senior
  const totalTix    = qty.adult + qty.child + qty.senior
  const canCheckout = totalTix > 0 || selected.size > 0

  const mm = Math.floor(secs / 60)
  const ss = String(secs % 60).padStart(2, '0')
  const urgent = secs <= 60

  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>
  if (!movie)  return null

  return (
    <div className="booking-page">
      {/* ── HEADER ── */}
      <div className="booking-hdr glass">
        <button className="back-btn" onClick={() => navigate(`/movie/${id}`)}>
          ← Back to Movie
        </button>
        <div className="booking-hdr-row">
          <img
            className="booking-thumb"
            src={movie.poster}
            alt={movie.title}
            onError={e => { e.target.style.display = 'none' }}
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
            ⏱ {mm}:{ss}
          </div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="booking-body">
        {/* SEAT MAP */}
        <div className="seat-section">
          <div className="screen-label">Screen</div>
          <div className="screen-bar" />

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
                      title={isTaken ? 'Unavailable' : sid}
                      aria-label={isTaken ? `Seat ${sid} unavailable` : `Select seat ${sid}`}
                    />
                  )
                })}
              </div>
            ))}
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
            { key: 'adult',  label: 'Adult',  price: PRICES.adult,  hint: 'Ages 18–64' },
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
                <button className="qbtn" onClick={() => changeQty(key, -1)}>−</button>
                <span className="qv">{qty[key]}</span>
                <button className="qbtn" onClick={() => changeQty(key, 1)}>+</button>
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
            onClick={() => alert('Checkout will be implemented in Sprint 2!')}
          >
            Proceed to checkout
          </button>
          <p className="ck-note">Full booking logic coming in Sprint 2</p>
        </div>
      </div>
    </div>
  )
}
