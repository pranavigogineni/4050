# CineMax — Cinema E-Booking System (CES)
### CSCI 4050/6050 — Team 5 — Sprint 1

---

## Quick Start

### 1. Backend
```bash
cd backend
npm install
setup .env
node server.js
# → http://localhost:5001
# SQLite DB auto-created and seeded with 10 movies on first run
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
# /api/* automatically proxied to backend
```

---

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

**Backend:** Node.js, Express, better-sqlite3  
**Frontend:** React 18, React Router v6, Vite, Axios  
**Design:** Liquid glass UI — backdrop-filter blur, gradient accents, Syne + Inter fonts
