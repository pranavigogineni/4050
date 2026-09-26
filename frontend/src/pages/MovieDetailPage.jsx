import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useMovie from '../hooks/useMovie'
import LoadError from '../components/LoadError'
import Poster from '../components/Poster'
import './MovieDetailPage.css'

export default function MovieDetailPage() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const { movie, loading, error, retry } = useMovie(id)
  useEffect(() => {
    if (movie && window.location.hash === '#trailer') document.getElementById('trailer')?.scrollIntoView()
  }, [movie])
  if (loading) return <div className="spinner-wrap" role="status" aria-label="Loading movie"><div className="spinner" /></div>
  if (error) return <LoadError message={error} retry={retry} />
  if (!movie) return null

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
        <button className="back-btn" onClick={() => navigate('/')}>← Back to movies</button>

        {/* ── MAIN LAYOUT ── */}
        <div className="detail-layout">
          <div className="detail-poster-col">
            <Poster
              className="detail-poster"
              src={movie.poster}
              alt={movie.title}
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
                      Book {t} <span className="st-arrow">→</span>
                    </button>
                  ))
                : <p className="no-shows">There are no shows available.</p>
              }
            </div>
          </div>
        </div>

        {/* ── TRAILER ── */}
        <div className="trailer-section" id="trailer">
          <h2 className="trailer-hdr">
            <span className="play-icon">▶</span>
            Official Trailer
          </h2>
          <div className="trailer-frame">
            <iframe
              src={`${movie.trailer_url}?rel=0&modestbranding=1`}
              title={`${movie.title} — Official Trailer`}
              allowFullScreen
              allow="autoplay; encrypted-media; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
