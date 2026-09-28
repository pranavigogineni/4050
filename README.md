# CineMax 🎬

**CSCI 4050/6050 · Team 5 · Deliverable 2 (Sprint 1)**

CineMax is our cinema booking site. For this sprint, we basically built a movie catalog where you can browse films, search by title, filter by genre, watch trailers, and try out a booking flow. It runs on React, Express, and SQLite.

## Running the demo

You'll need Node.js 20 (run `nvm use` if you have nvm). From the project root:

    npm ci --prefix backend
    npm ci --prefix frontend
    npm run build --prefix frontend
    npm start --prefix backend

Then open **http://localhost:5001**. One server handles both the site and the API. Press Ctrl+C to stop it. If you change frontend code, rebuild before restarting.

The first time you run it, a database is created at `backend/cinema.db` with 10 movies, 6 genres, and 3 sample showtimes per movie. Everything you see in the catalog comes from that database. The showtimes and "Now Showing / Coming Soon" labels are sample data, not a real theater schedule.

## Developing locally

Start the backend in one terminal:

    npm run dev --prefix backend

And the frontend in another:

    npm run dev --prefix frontend

Open http://localhost:3000. Keep the backend on port 5001 so the frontend can reach it.

## Running tests

    npm test --prefix backend
    npm test --prefix frontend

The backend tests check the database, search, filters, and error handling. The frontend tests run the real app in Chrome and check things like search, booking controls, the seat timer, and mobile layout. You'll need Google Chrome installed, or set `PLAYWRIGHT_CHANNEL` to another supported browser. Tests use their own temporary databases, so demo data stays safe.

## What we built this sprint

| Requirement | What we did |
|---|---|
| Home page from database | 10 movies split into Now Showing and Coming Soon, with showtimes on each card |
| Movie details | Poster, title, genre, rating, synopsis, cast, director, showtimes |
| Search | Case-insensitive title search that works alongside the genre filter |
| Filters | Genre filter from the database; date filter shown but disabled (as required) |
| Trailers | YouTube trailers embedded on each movie page |
| Booking prototype | Pick a showtime, choose adult/child/senior tickets, select seats |
| Usability | Error and retry states, keyboard support, mobile layout |

**A quick note on booking:** it's a front-end prototype only. There's no real payment, login, or reservation yet. Once you pick seats, a 5-minute timer starts, and if it runs out, your selection resets. "Preview booking" shows your order and reminds you nothing was actually purchased. Ticket types: child (under 12), adult (12–64), senior (65+).

Trailers, posters, and fonts need an internet connection. If a poster doesn't load, a backup image appears. All trailers and artwork belong to their owners and are used here for this class project.

## Project layout

- `backend/server.js`: database setup, sample data, and API
- `backend/test/`: backend tests
- `frontend/src/`: React pages and components
- `frontend/test/`: browser tests
- `DEMO_CHECKLIST.md`: step-by-step demo walkthrough
- `scripts/package_submission.py`: builds the submission zip

## Submitting

    python3 scripts/package_submission.py

This creates `cesrepo-sprint1.zip` with just the source code. Before our demo, we'll:

1. Unzip it and make sure it runs.
2. Upload the zip or the GitHub link to eLC.
3. Schedule the demo, with at least two team members attending.
