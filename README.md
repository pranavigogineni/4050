# CineMax 🎬

**CSCI 4050/6050 · Team 5 · Sprints 1 and 2**

Sprint 2 adds registration and verification emails, login/logout, password recovery,
profile and encrypted card management, favorites, and a protected admin prototype.
See [SPRINT2.md](SPRINT2.md) for SMTP setup, admin setup, security details, and the demo checklist.

CineMax is our cinema booking site. For this sprint, we basically built a movie catalog where you can browse films, search by title, filter by genre, watch trailers, and try out a booking flow and it runs on React, Express, and PostgreSQL hosted on Supabase.

## Running the demo

You'll need Node.js 20.19+ (run `nvm use` if you have nvm). Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` to the Supabase **Session pooler** connection string (Supabase → Connect). Then, from the project root:

    npm ci --prefix backend
    npm ci --prefix frontend
    npm run configure:accounts --prefix backend
    npm run db:setup --prefix backend
    npm run build --prefix frontend
    npm start --prefix backend

Then open **http://localhost:5001**. One server handles both the site and the API. Press Ctrl+C to stop it. If you change frontend code, rebuild before restarting.

Configure SMTP in `backend/.env` before demonstrating account registration, recovery,
or profile notification emails. Until configured, email remains in the encrypted
delivery queue. `npm run configure:accounts --prefix backend` generates the private
encryption key once without replacing existing settings.

`npm run db:setup` creates the tables (`backend/db/migrations/`) and loads 10 movies, 6 genres, one theatre with 6 showrooms of 70 seats, and adult/child/senior ticket types. The team shares one Supabase database, so only one person needs to run it; running it again is safe. It also schedules a week of shows (2:00, 5:00 and 8:00 PM) for each now-playing movie, so re-run it if the schedule runs out. The showtimes and "Now Showing / Coming Soon" labels are sample data, not a real theater schedule. The full schema is in `schema.dbml` (paste it into dbdiagram.io).

## Developing locally

Start the backend in one terminal:

    npm run dev --prefix backend

And the frontend in another:

    npm run dev --prefix frontend

Open http://localhost:3000. Keep the backend on port 5001 so the frontend can reach it.

## Running tests

    npm test --prefix backend
    npm test --prefix frontend

The backend tests check the database, search, filters, and error handling. The frontend tests run the real app in Chrome and check things like search, booking controls, the seat timer, and mobile layout. You'll need Google Chrome installed, or set `PLAYWRIGHT_CHANNEL` to another supported browser. Tests run in their own `test_*` schemas in the database (set `TEST_DATABASE_URL` to use a different one), so demo data stays safe.

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

- `backend/server.js`: API
- `backend/db/`: database connection, migrations, and sample data
- `backend/test/`: backend tests
- `frontend/src/`: React pages and components
- `frontend/test/`: browser tests
- `DEMO_CHECKLIST.md`: step-by-step demo walkthrough
- `scripts/package_submission.py`: builds the submission zip
