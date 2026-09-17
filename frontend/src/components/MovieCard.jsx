import { useNavigate } from 'react-router-dom'
import './MovieCard.css'

export default function MovieCard({ movie }) {
  const navigate = useNavigate()

  return (
    <article
      className="mcard"
      onClick={() => navigate(`/movie/${movie.id}`)}
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && navigate(`/movie/${movie.id}`)}
      role="button"
      aria-label={`View details for ${movie.title}`}
    >
      <div className="mcard-img">
        <img
          src={movie.poster}
          alt={movie.title}
          loading="lazy"
          onError={e => {
            e.target.src = `https://placehold.co/200x300/0c0e23/4f7eff?text=${encodeURIComponent(movie.title)}`
          }}
        />
        <div className="mcard-shine" />
        <div className="mcard-overlay">
          <span className="mcard-cta">View details</span>
        </div>
        <span className="mcard-rating tag tag-rating">{movie.rating}</span>
        {movie.status === 'coming_soon' && movie.release_date && (
          <span className="mcard-release">📅 {movie.release_date}</span>
        )}
      </div>

      <div className="mcard-body">
        <div className="mcard-title" title={movie.title}>{movie.title}</div>
        <div className="mcard-meta">
          <span className="tag tag-genre">{movie.genre}</span>
          {movie.status === 'running'
            ? <span className="tag tag-now">Now Showing</span>
            : <span className="tag tag-soon">Coming Soon</span>
          }
        </div>
      </div>
    </article>
  )
}
