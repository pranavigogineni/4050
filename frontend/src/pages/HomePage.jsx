import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchMovies, fetchGenres } from '../api/movies'
import SearchBar from '../components/SearchBar'
import MovieCard from '../components/MovieCard'
import './HomePage.css'

export default function HomePage() {
  const navigate   = useNavigate()
  const [movies,  setMovies]  = useState([])
  const [genres,  setGenres]  = useState([])
  const [search,  setSearch]  = useState('')
  const [genre,   setGenre]   = useState('')
  const [loading, setLoading] = useState(true)

  // load genres once
  useEffect(() => {
    fetchGenres().then(setGenres).catch(console.error)
  }, [])

  // reload movies whenever search or genre changes
  useEffect(() => {
    setLoading(true)
    const params = {}
    if (search) params.search = search
    if (genre)  params.genre  = genre
    fetchMovies(params)
      .then(data => { setMovies(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [search, genre])

  const running = movies.filter(m => m.status === 'running')
  const coming  = movies.filter(m => m.status === 'coming_soon')
  const isFiltered = search || genre

  return (
    <div className="home-page">
      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-orbs">
          <div className="orb orb1" /><div className="orb orb2" /><div className="orb orb3" />
        </div>
        <div className="hero-content">
          <div className="hero-tag">
            <span className="hero-dot" />
            Now streaming live showtimes
          </div>
          <h1 className="hero-h1">
            Your cinema,<br />
            <span className="hero-gradient">reimagined.</span>
          </h1>
          <p className="hero-sub">
            Book seats, catch trailers, and plan your night — all from one place.
          </p>
          <div className="hero-actions">
            <button
              className="btn-primary"
              onClick={() => document.querySelector('.controls-bar')
                ?.scrollIntoView({ behavior: 'smooth' })}
            >
              Browse movies
            </button>
            <button className="btn-ghost" onClick={() => navigate('/movie/1')}>
              Watch a trailer
            </button>
          </div>
        </div>
      </section>

      {/* ── SEARCH + FILTER ──────────────────────────────────────── */}
      <SearchBar
        search={search} onSearch={setSearch}
        genre={genre}   onGenre={setGenre}
        genres={genres}
      />

      {/* ── CONTENT ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="spinner-wrap"><div className="spinner" /></div>
      ) : isFiltered ? (
        /* ── FILTERED RESULTS ── */
        <section className="home-section">
          <div className="section-hdr">
            <div className="sh-pip sh-pip-blue" />
            <h2 className="sh-title">
              {search ? `Results for "${search}"` : `${genre} movies`}
            </h2>
            <span className="sh-count">{movies.length}</span>
          </div>
          {movies.length === 0 ? (
            <div className="no-results">
              <div className="nr-icon">🎞️</div>
              <h3>No results found for "{search || genre}"</h3>
              <p>Try a different keyword or remove the filter.</p>
            </div>
          ) : (
            <div className="movie-grid">
              {movies.map(m => <MovieCard key={m.id} movie={m} />)}
            </div>
          )}
        </section>
      ) : (
        /* ── TWO SECTIONS ── */
        <>
          <section className="home-section">
            <div className="section-hdr">
              <div className="sh-pip sh-pip-blue" />
              <h2 className="sh-title">Now Showing</h2>
              <span className="sh-count">{running.length}</span>
            </div>
            {running.length === 0 ? (
              <div className="no-results">
                <div className="nr-icon">🎞️</div>
                <h3>No movies currently showing.</h3>
              </div>
            ) : (
              <div className="movie-grid">
                {running.map(m => <MovieCard key={m.id} movie={m} />)}
              </div>
            )}
          </section>

          <div className="section-divider" />

          <section className="home-section">
            <div className="section-hdr">
              <div className="sh-pip sh-pip-violet" />
              <h2 className="sh-title">Coming Soon</h2>
              <span className="sh-count">{coming.length}</span>
            </div>
            {coming.length === 0 ? (
              <div className="no-results">
                <div className="nr-icon">📅</div>
                <h3>Stay tuned for upcoming releases.</h3>
              </div>
            ) : (
              <div className="movie-grid">
                {coming.map(m => <MovieCard key={m.id} movie={m} />)}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
