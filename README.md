# CineMax — Cinema E-Booking System (CES)
### CSCI 4050/6050 — Team 5 — Sprint 1

---

## Quick Start

Use Node.js 20 (`nvm use` if you use nvm).

### 1. Backend
```bash
cd backend
npm install
node server.js
# → http://localhost:5001
# SQLite DB auto-created and seeded with 10 movies on first run
```

The backend creates `backend/cinema.db` and seeds 10 movies and three showtimes per movie when the movies table is empty. Existing local records are preserved on restart. No Supabase account or `DATABASE_URL` is needed. This uses local sample data; it does not copy data from Supabase.

Configuration is optional: copy `backend/.env.example` to `backend/.env` to override `PORT` or `SQLITE_DB_PATH`. Relative database paths are resolved from `backend/`; any parent directory must already exist. Keep port 5001 when using the default frontend proxy. Local database files and `.env` are ignored by Git.

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
# /api/* automatically proxied to backend
```

---

## Backend Checks

```bash
cd backend
npm test
```

The tests use a temporary SQLite database and verify seeding, API search/filter results, showtimes, and persistence across restarts.

## Project Structure
```
ces/
├── backend/
│   ├── server.js          # Express + SQLite API
│   ├── package.json
│   └── cinema.db          # auto-generated on first run
└── frontend/
    ├── index.html
    ├── vite.config.js     # proxy: /api → :5001
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx         # React Router
        ├── index.css       # global design tokens (liquid glass)
        ├── api/
        │   └── movies.js   # axios API wrapper
        ├── components/
        │   ├── Navbar.jsx + .css
        │   ├── MovieCard.jsx + .css
        │   └── SearchBar.jsx + .css
        └── pages/
            ├── HomePage.jsx + .css         # hero, search, filter, movie grid
            ├── MovieDetailPage.jsx + .css  # details, trailer, showtimes
            └── BookingPage.jsx + .css      # seat map, ticket qty, timer
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/movies` | All movies. Supports `?search=title&genre=Genre` |
| GET | `/api/movies/:id` | Single movie with showtimes array |
| GET | `/api/genres` | Distinct genre list for filter dropdown |

---

## Sprint 1 Deliverable Checklist

| Requirement | Status |
|-------------|--------|
| Home Page — movies from DB (not hardcoded) | ✅ |
| Now Showing / Coming Soon sections | ✅ |
| Empty state messages | ✅ |
| Movie Details Page (title, rating, desc, poster, trailer, showtimes) | ✅ |
| Embedded playable YouTube trailers | ✅ |
| Search by title (case-insensitive, partial match) | ✅ |
| Filter by genre (DB-backed) | ✅ |
| Date filter shown in UI, disabled with Sprint 2 note | ✅ |
| Booking Page UI — movie title + showtime displayed | ✅ |
| Booking Page — Adult/Child/Senior ticket qty + prices | ✅ |
| Booking Page — Interactive seat map | ✅ |
| 5-minute countdown timer on booking page | ✅ |
| 10+ seeded movies, multiple genres, both statuses | ✅ |
| Release date shown on Coming Soon cards | ✅ |

---

## Tech Stack

**Backend:** Node.js, Express, SQLite (better-sqlite3)
**Frontend:** React 18, React Router v6, Vite, Axios  
**Design:** Liquid glass UI — backdrop-filter blur, gradient accents, Syne + Inter fonts
