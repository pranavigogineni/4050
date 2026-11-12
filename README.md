# CineMax 🎬

**CSCI 4050/6050 · Team 5 · Sprints 1, 2 and 3**

Sprint 2 adds registration and verification emails, login/logout, password recovery,
profile and encrypted card management, favorites, and a protected admin portal. Sprint 3 adds movie creation, showtime scheduling,
database seat maps, and checkout through a mock payment page.
SMTP setup, admin setup, security details, and the Sprint 2 demo checklist are included below.

CineMax is bascially our cinema booking site. It runs on React, Express, and PostgreSQL hosted on Supabase. You can browse films, search by title, filter by genre, watch trailers, try out a booking flow, and manage your account.

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

The configure command preserves existing settings and creates a random `DATA_ENCRYPTION_KEY` only if one is missing. Keep this secret key backed up and use the same key for all servers sharing this database. Replacing it makes existing encrypted cards and pending emails unreadable. Never commit `.env`. Migrations add account tables and card metadata without replacing catalog data; `db:setup` is only necessary if the catalog has not been seeded.

For separate Vite/backend development, use the existing two `npm run dev` commands and set `APP_URL=http://localhost:3000`. For the combined production build, use `APP_URL=http://localhost:5001`.

## Developing locally

Start the backend in one terminal:

    npm run dev --prefix backend

And the frontend in another:

    npm run dev --prefix frontend

Open http://localhost:3000. Keep the backend on port 5001 so the frontend can reach it.

## Running tests

    npm test --prefix backend
    npm test --prefix frontend

Both suites use disposable `test_*` schemas, preserving the demo catalog. Set `TEST_DATABASE_URL` to target a separate database. Backend tests exercise the real PostgreSQL schema, account API, encryption, token/session lifecycles, access restrictions, ownership, favorites, concurrency, throttling and email queue delivery. Browser tests run the built app in Chrome and cover Sprint 1 plus registration, verification, profile/card/favorite changes, password change/reset, role navigation and mobile layout. Test emails are captured locally; tests never send mail to the sample addresses.

Development uses Node's built-in `--watch` support instead of nodemon. Use Node 20.19 or newer (the audit ran on 20.20.2). The browser test launcher explicitly builds the frontend in production mode while keeping the test backend's email capture isolated.

## Movie catalog and booking features

| Requirement | What we did |
|---|---|
| Home page from database | 10 movies split into Now Showing and Coming Soon, with showtimes on each card |
| Movie details | Poster, title, genre, rating, synopsis, cast, director, showtimes |
| Search | Case-insensitive title search that works alongside the genre filter |
| Filters | Genre filter from the database; date filter shown but disabled (as required) |
| Trailers | YouTube trailers embedded on each movie page |
| Booking | Pick a dated showtime/showroom, choose ticket categories and seats, log in, review the order and continue to the payment mockup |
| Usability | Error and retry states, keyboard support, mobile layout |

**Booking scope:** seats and prices load from PostgreSQL, and booked seats are disabled.
Selections are kept in `sessionStorage` for the current browser tab, including across
refreshes and login. Checkout requires a customer account and recalculates prices and
checks booked seats on the server. The summary lets the customer confirm or change
the order email without changing their profile. The payment page is a mockup: no
payment, final booking, or confirmation email is created. Cross-session seat locks
and automatic five-minute expiration are deferred to the final demo, as allowed by
the Sprint 3 rubric. Closing the tab discards its draft. Ticket categories and prices
come from `ticket_types` rather than hardcoded UI values.

Trailers, posters, and fonts need an internet connection. If a poster doesn't load, a backup image appears. All trailers and artwork belong to their owners and are used here for this class project.

## Project layout

- `backend/server.js`: API
- `backend/db/`: database connection, migrations, and sample data
- `backend/test/`: backend tests
- `frontend/src/`: React pages and components
- `frontend/test/`: browser tests
- `README.md`: setup instructions and Sprint 2 demo walkthrough
- `scripts/package_submission.py`: builds the submission zip

## Email configuration

Set these in `backend/.env` using your SMTP provider:

```dotenv
APP_URL=http://localhost:5001
MAIL_MODE=smtp
SMTP_HOST=your-provider-host
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
SMTP_FROM=CineMax <your-verified-sender@example.com>
```

Port 587 uses STARTTLS. For port 465, set `SMTP_SECURE=true`. Use a provider-approved sender. Restart the backend after changing configuration.

Account creation and profile changes commit an encrypted email to `email_outbox` in the same database transaction. A worker delivers it over SMTP, retries failures with backoff, and removes the encrypted message after delivery. Missing SMTP configuration leaves emails queued and prints a startup notice. Delivery is at least once: if the provider accepts a message but the database acknowledgement fails, the worker may retry it. No card numbers or passwords appear in email.

## Demo checklist

| Requirement | Demonstration |
| --- | --- |
| Registration and status | Sign up with required fields; try malformed email, phone, weak/mismatched passwords, incomplete address, invalid/expired card, and duplicate email. New accounts are `INACTIVE` and cannot log in. |
| Confirmation email | Open the real verification email and click **Verify email**. The account becomes `ACTIVE`. Reused or expired links fail; resend replaces earlier links. |
| Login validation | Try wrong credentials, inactive and suspended accounts, then a verified account. Customer lands on the catalog; administrator lands on `/admin`. |
| Admin prototype | The protected portal includes Manage Movies, Promotions, Users and Showtimes; movie creation and showtime scheduling are functional; Promotions and Users show their scope. |
| Forgot password | Request a reset email, follow its link, and enter matching new passwords. Old passwords and existing sessions stop working. Links expire after 30 minutes and work once. |
| Logout | Use **Log out**; refreshing or revisiting `/profile` requires login. The server deletes the session, not just browser state. |
| Profile | Edit name, phone, the single home address, or promotional subscription. Reload to verify persistence and check the notification email. Email is read-only and API updates to it are rejected. |
| Payment cards | Add, edit and remove cards. Only masked numbers are returned. Add three, then verify a fourth is rejected. The API also enforces ownership and concurrent limits. |
| Favorites | Tap a heart on a catalog card or detail page. View saved movies in My profile, reload to verify persistence, follow a movie link, or remove a favorite. |
| Change password | Supply an incorrect current password, then the correct one. Successful change revokes every session and sends a notification email. |
| Usability | Required fields are marked; forms show errors, progress and confirmation. Pages adapt to mobile widths and controls have keyboard focus and accessible labels. |

### Demonstrating the administrator role

Register an account and verify its email normally. Then a trusted operator runs:

```sh
npm run make-admin --prefix backend -- verified-email@example.com
```

Log in again. The script promotes only an existing active account and invalidates its sessions. There are no hardcoded admin credentials, public role change endpoints, or admin registration options. Movie creation and showtime scheduling are implemented. Movie edit/delete and user management are not required for Sprint 3; promotion management is an optional bonus and is not implemented.

## Security behavior

- Passwords use per password random salts and Node's `scrypt` (`N=32768`, `r=8`, `p=3`); passwords are never returned or emailed.
- Card numbers and pending email bodies use AES-256-GCM with fresh random IVs and context binding. Card APIs return only the last four digits and non-secret metadata. No CVV is accepted for storage.
- Sessions are random opaque tokens; only hashes are stored in PostgreSQL. Cookies are HttpOnly, SameSite=Lax, and Secure in production. Sessions expire after eight hours.
- Verification links expire after 24 hours; reset links after 30 minutes. Only token hashes are stored. Email URLs put tokens in the fragment so they do not appear in server access logs.
- Authenticated endpoints check the database account status and role. Password changes/reset revoke all sessions. Session creation rechecks credentials under a row lock.
- Writes require a custom header, JSON and an allowed origin. CORS is not opened to arbitrary origins. Auth endpoints have database-backed rate limits.
- SQL is parameterized. Users cannot modify their email, role or status through profile updates. Card access is scoped by owner; favorites are unique per customer/movie.
- New tables enable row-level security to block direct anonymous Supabase REST access, matching the existing architecture.
- In production use HTTPS with `NODE_ENV=production` and an HTTPS `APP_URL`. Configure a trusted reverse proxy deliberately if adding one; the server does not blindly trust forwarded client IPs.

## Database certificate verification

Download the server root certificate from **Supabase → Database settings → SSL configuration** and set `DB_SSL_CA_FILE` in `backend/.env` to its location. Relative paths resolve from `backend/`. For example:

```dotenv
DB_SSL_CA_FILE=certs/supabase-root.crt
```

Supplying this file enables certificate verification in development. Production always requires verified TLS for remote databases and fails closed if the certificate cannot be verified. Without a certificate configured, the existing development connection remains encrypted but does not authenticate the database server. The audit confirmed this project's certificate chain needs a supplied CA; do not mark this configuration check complete until the teammate supplies it. See [Supabase's SSL instructions](https://supabase.com/docs/guides/database/connecting-to-postgres#ssl).


## Sprint 3 setup and demo

Reuse the existing PostgreSQL/Supabase database. No new migrations or tables are
required for Sprint 3. Existing `movies`, `movie_genres`, `shows`, `showrooms`,
`seats`, `ticket_types`, and `tickets` tables supply the data. If starting from a
fresh database, run the setup commands above. On an existing database, run
`npm run seed --prefix backend` if upcoming shows have expired. The seed provides
six showrooms with 70 seats each.

1. Log in as an administrator. Open **Manage Movies**, enter all required fields,
   choose a genre, and add a movie. Follow its catalog link to verify persistence.
2. Open **Manage Showtimes**, choose a movie, date, time, and duration. Find available
   showrooms, select one, and confirm. Times use America/New_York. Overlapping
   intervals are excluded from the choices and rejected by the database if the
   schedule changes before submission. Back-to-back shows are allowed.
3. As a guest, open a movie and select a dated showtime and showroom. Choose ticket
   quantities and matching seats. Proceed to checkout, log in as a customer, and
   verify the selection survives. Review ticket prices, seats, and subtotal;
   confirm/change the email, then continue to the payment mockup.
4. Try blank movie fields, invalid URLs, invalid show dates, occupied intervals,
   mismatched seat counts, and invalid checkout email. Backend integration tests
   also insert a booked ticket and verify rejection at summary/payment.

Architecture: React pages call Express route controllers. `backend/cinema/routes.js`
contains the Sprint 3 validation and database queries; account middleware supplies
session/role checks and write protection. PostgreSQL enforces relational integrity
and showroom overlap constraints. Draft seat selection is intentionally local to a
tab for this sprint; the existing selection/hold tables support future server holds.

Run `npm test --prefix backend` and `npm test --prefix frontend` against a valid
`DATABASE_URL` or `TEST_DATABASE_URL`. They use disposable schemas. The supplemental
`npm run test:ui --prefix frontend` checks Sprint 3 browser behavior with mocked API
responses and does not require a database; it does not replace integration tests.

If Supabase reports “tenant/user not found,” check that the project is active and
replace `DATABASE_URL` in `backend/.env` with its current Session pooler connection
string. Never commit or share the password.
