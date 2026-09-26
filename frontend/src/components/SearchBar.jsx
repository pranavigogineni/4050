import './SearchBar.css'

export default function SearchBar({ search, onSearch, genre, onGenre, genres }) {
  return (
    <div className="controls-bar glass">
      {/* ── TITLE SEARCH ── */}
      <div className="ctrl-search">
        <span className="cs-icon">🔍</span>
        <input
          className="cs-input"
          type="search"
          aria-label="Search by title"
          placeholder="Search by title…"
          value={search}
          onChange={e => onSearch(e.target.value)}
        />
        {search && (
          <button className="cs-clear" aria-label="Clear search" onClick={() => onSearch('')}>✕</button>
        )}
      </div>

      {/* ── GENRE FILTER ── */}
      <div className="filter-pill">
        <span>🎬</span>
        <select aria-label="Filter by genre"
          value={genre}
          onChange={e => onGenre(e.target.value)}
        >
          <option value="">All genres</option>
          {genres.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <span className="fp-arrow">▾</span>
      </div>

      {/* ── DATE FILTER (UI only, Sprint 2) ── */}
      <div className="filter-pill filter-pill-disabled" title="Date filter coming in Sprint 2">
        <span>📅</span>
        <select disabled aria-label="Filter by show date (coming in Sprint 2)">
          <option>All dates</option>
          <option>Today</option>
          <option>This Weekend</option>
        </select>
        <span className="fp-arrow">▾</span>
      </div>
      <span className="sprint-chip">Date filter → Sprint 2</span>
    </div>
  )
}
