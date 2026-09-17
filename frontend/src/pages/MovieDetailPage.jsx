import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchMovie } from '../api/movies'
import './MovieDetailPage.css'

export default function MovieDetailPage() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const [movie,   setMovie]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchMovie(id)
      .then(data => { setMovie(data); setLoading(false) })
      .catch(() => navigate('/'))
  }, [id])

  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>
  if (!movie)  return null

  return (
    <div className="detail-page">
      {/* blurred poster backdrop */}
      <div
        className="detail-backdrop"
        style={{ backgroundImage: `url(${movie.poster})` }}
      />
      <div className="detail-backdrop-fade" />

      <div className="detail-inner">
        {/* ── BACK ── */}
        <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>

        {/* ── MAIN LAYOUT ── */}
        <div className="detail-layout">
          <div className="detail-poster-col">
            <img
              className="detail-poster"
              src={movie.poster}
              alt={movie.title}
              onError={e => { e.target.src = `https://placehold.co/300x450/0c0e23/4f7eff?text=${encodeURIComponent(movie.title)}` }}
            />
          </div>

          <div className="detail-info-col">
            {/* tags row */}
            <div className="detail-tags">
              <span className="tag tag-rating">{movie.rating}</span>
              <span className="tag tag-genre">{movie.genre}</span>
              {movie.status === 'running'
                ? <span className="tag tag-now">Now Showing</span>
                : <span className="tag tag-soon">Coming Soon</span>}
            </div>

            <h1 className="detail-title">{movie.title}</h1>

            <div className="detail-meta">
              <span>🎬 {movie.director}</span>
              <span>👥 {movie.cast_members}</span>
              {movie.release_date && <span>📅 {movie.release_date}</span>}
            </div>

            <p className="detail-desc">{movie.description}</p>

            {/* showtimes */}
            <div className="detail-sublabel">Select a showtime</div>
            <div className="showtimes-row">
              {movie.showtimes && movie.showtimes.length > 0
                ? movie.showtimes.map(t => (
                    <button
                      key={t}
                      className="st-btn"
                      onClick={() => navigate(`/booking/${movie.id}/${encodeURIComponent(t)}`)}
                    >
                      {t} <span className="st-arrow">→</span>
                    </button>
                  ))
                : <p className="no-shows">There are no shows available.</p>
              }
            </div>
          </div>
        </div>

        {/* ── TRAILER ── */}
        <div className="trailer-section">
          <h2 className="trailer-hdr">
            <span className="play-icon">▶</span>
            Official Trailer
          </h2>
          <div className="trailer-frame">
            <iframe
              src={`${movie.trailer_url}?rel=0&modestbranding=1`}
              title={`${movie.title} — Official Trailer`}
              allowFullScreen
              allow="autoplay; encrypted-media"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
