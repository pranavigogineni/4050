# CineMax — Cinema E-Booking System

CSCI 4050/6050 · Team 5 · Deliverable 2 (Sprint 1)

A working React, Express and SQLite movie catalog with title search, genre filtering, embedded trailers and a booking UI prototype.

## Run the demo

Use Node.js 20 (`nvm use` if available). From the project root:

```sh
npm ci --prefix backend
npm ci --prefix frontend
npm run build --prefix frontend
npm start --prefix backend
```

Open **http://localhost:5001**. Express serves both the built frontend and API, including direct links to movie and booking pages. Stop with Ctrl+C. Build again after changing frontend source.

A fresh database is created automatically at `backend/cinema.db`, with 10 movies, 6 genres, both movie statuses, and three sample showtimes per movie. Movies and genres displayed in the UI are queried from SQLite. Showtimes are sample values allowed by the assignment; movie statuses are sample catalog classifications, not a current real-world cinema schedule.

Existing nonempty databases are not reseeded. One-time migrations repair known old sample titles/trailers/dates and the broken Dune poster; subsequent edits are preserved. Migrations are recorded in `schema_migrations`.

Optional configuration: copy `backend/.env.example` to `backend/.env`. `PORT` defaults to 5001. `SQLITE_DB_PATH` defaults to `cinema.db`; relative paths resolve from `backend/`, and the parent directory must exist. No external database account is required. Database files and `.env` are excluded from Git and submission archives.

## Development

Run the backend in one terminal:

```sh
npm run dev --prefix backend
```

In another terminal:

```sh
npm run dev --prefix frontend
```

Open http://localhost:3000. Vite proxies `/api` to port 5001; keep the backend default port for this workflow. For the demo, the production workflow above needs only one running server.

## Checks

```sh
npm test --prefix backend
npm test --prefix frontend
```

Backend tests use disposable databases and verify seeding, all movie details/showtimes, search/filter combinations, literal wildcard handling, invalid queries, missing IDs, migrations and persistence. Frontend tests build the app and start an isolated backend on port 5017, then exercise production routes in Chrome. Install Google Chrome before running frontend tests; alternatively install a Playwright-supported browser and set `PLAYWRIGHT_CHANNEL` accordingly. External media requests are blocked in deterministic regression tests and are verified separately during the demo rehearsal.

Browser tests cover search response ordering, API recovery, empty states, booking controls, repeat timer expiry, malformed links, local poster fallback and mobile layout. Test databases are temporary and do not overwrite the demo database.

## Deliverable 2 scope

| Requirement | Implementation |
|---|---|
| Home populated from database | 10 seeded movies, Now Showing / Coming Soon, card showtimes |
| Movie details | Poster, title, genre, rating, synopsis, cast, director, showtimes |
| Title search | Case-insensitive partial matching, combined genre filter, no-match message |
| Filters | DB-backed genre control; show-date control visible and disabled as required |
| Trailers | Embedded YouTube players on movie detail pages |
| Booking prototype | Validated movie/time, adult/child/senior quantities and prices, selectable seat map |
| Usability | Error/retry states, keyboard controls, mobile layout, selection/count validation |

Booking is **UI only**: sample unavailable seats, no actual reservations, payment, authentication or checkout backend. The optional five-minute local timer begins with seat selection, clears seats and quantities on expiry, and restarts with a new selection. “Preview booking” requires equal positive ticket and seat counts and explicitly reports that nothing has been purchased or reserved. Adult sample category covers ages 12–64, child under 12, senior 65+.

Trailers, original posters and fonts require an internet connection. A bundled local image appears if a poster cannot load. Videos and poster artwork belong to their respective owners; they are linked for the academic cinema demo. Rehearse playback on the demo machine/network.

## Structure

- `backend/server.js`: schema, seed, one-time migrations, read-only API, production static hosting.
- `backend/test/sqlite.test.js`: API/database regression checks.
- `frontend/src/`: React pages, reusable components and API access.
- `frontend/test/`: Playwright regression checks and `frontend/playwright.config.js` configuration.
- `DEMO_CHECKLIST.md`: requirement-by-requirement presentation steps.
- `scripts/package_submission.py`: reproducible source-only archive builder.

## Submission

```sh
python3 scripts/package_submission.py
```

This rebuilds `cesrepo-sprint1.zip` using current source and both lockfiles, excluding Git internals, local databases, secrets, dependencies, generated builds and historical audit artifacts. Extract it, run the demo commands above, then submit either this archive or the current GitHub repository link to eLC before your scheduled demo. Schedule the demo and arrange at least two attending members. The code does not submit anything to eLC automatically.
