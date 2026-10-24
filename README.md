# CineMax 🎬

**CSCI 4050/6050 · Team 5 · Sprints 1 and 2**

CineMax is our movie booking project for CSCI 4050/6050. We built it with React, Express, and PostgreSQL on Supabase. You can browse movies, search by title, filter by genre, watch trailers, and try out the booking flow.

For Sprint 2, we added sign up, email verification, login/logout, password resets, profile editing, saved cards, and favorites. We also added an admin page, but the management screens are still prototypes.

Everything you need to run it and walk through the demo is below.

## Running the demo

You'll need Node.js 20.19+ (run `nvm use` if you have nvm). Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` to the Supabase **Session pooler** connection string (Supabase → Connect). Then, from the project root:

    npm ci --prefix backend
    npm ci --prefix frontend
    npm run configure:accounts --prefix backend
    npm run db:setup --prefix backend
    npm run build --prefix frontend
    npm start --prefix backend

Then open **http://localhost:5001**. One server handles both the site and the API. Press Ctrl+C to stop it. If you change frontend code, rebuild before restarting.

You'll also need to set up SMTP in `backend/.env` for verification, password reset, and profile update emails to actually send. The email setup section below covers that. Without it, emails stay in the queue.

`db:setup` creates the tables and adds our sample data: 10 movies, 6 genres, and one theater with 6 showrooms of 70 seats each. It also adds ticket types and a week of showtimes at 2:00, 5:00, and 8:00 PM for each now-playing movie. We share one Supabase database, so only one teammate needs to run this. You can run it again if the showtimes run out. These are sample schedules for the project.

If the database already has the movies, you can use `npm run migrate --prefix backend` instead of `db:setup` to add the account tables without reseeding. The full database schema is in `schema.dbml`, which you can open in dbdiagram.io.

The `configure:accounts` command keeps your existing settings and creates a `DATA_ENCRYPTION_KEY` if you don't have one. Keep a backup of that key and use the same one anywhere that connects to our database. Changing it means saved cards and queued emails can no longer be decrypted. Don't commit your `.env` file.

Use `APP_URL=http://localhost:5001` when running the built app, or `APP_URL=http://localhost:3000` when running the frontend and backend separately.

## Developing locally

Start the backend in one terminal:

    npm run dev --prefix backend

And the frontend in another:

    npm run dev --prefix frontend

Open http://localhost:3000. Keep the backend on port 5001 so the frontend can reach it.

## Running tests

    npm test --prefix backend
    npm test --prefix frontend

The tests use their own `test_*` database schemas, so they leave the demo data alone. You can set `TEST_DATABASE_URL` if you want to use a separate database.

Backend tests cover the database, account features, encryption, permissions, favorites, and email queue. Frontend tests run the app in Chrome and check the main user flows and mobile layout. You'll need Chrome installed, or you can set `PLAYWRIGHT_CHANNEL` to another supported browser. Test emails are saved locally, so the tests don't send real emails.

The browser tests build the frontend automatically. For development, we use Node's built-in `--watch` mode, so there's no need to install nodemon.

## What you can do

| Requirement | What we did |
|---|---|
| Home page from database | 10 movies split into Now Showing and Coming Soon, with showtimes on each card |
| Movie details | Poster, title, genre, rating, synopsis, cast, director, showtimes |
| Search | Case-insensitive title search that works alongside the genre filter |
| Filters | Genre filter from the database; date filter shown but disabled (as required) |
| Trailers | YouTube trailers embedded on each movie page |
| Booking prototype | Pick a showtime, choose adult/child/senior tickets, select seats |
| Usability | Error and retry states, keyboard support, mobile layout |

**A quick note on booking:** it's a front-end prototype only. There's no real payment or reservation yet. Account login is implemented in Sprint 2. Once you pick seats, a 5-minute timer starts, and if it runs out, your selection resets. "Preview booking" shows your order and reminds you nothing was actually purchased. Ticket types: child (under 12), adult (12–64), senior (65+).

Trailers, posters, and fonts need an internet connection. If a poster doesn't load, a backup image appears. All trailers and artwork belong to their owners and are used here for this class project.

## Where things are

- `backend/server.js`: API
- `backend/db/`: database connection, migrations, and sample data
- `backend/test/`: backend tests
- `frontend/src/`: React pages and components
- `frontend/test/`: browser tests
- `README.md`: setup instructions and Sprint 2 demo walkthrough
- `scripts/package_submission.py`: builds the submission zip

## Setting up emails

Add your email provider's SMTP settings to `backend/.env`:

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

Port 587 uses STARTTLS. If your provider uses port 465, change `SMTP_SECURE` to `true`. Make sure the sender address is approved by your provider, then restart the backend.

When someone signs up or updates their profile, the app saves an encrypted email in `email_outbox`. A background worker sends it and retries if delivery fails. Once it's sent, the queued message is removed. A retry can occasionally send the same email twice if the provider accepted it but the database didn't record that. Emails never include passwords or card numbers.

For local testing, you can use `MAIL_MODE=file`. This saves emails as JSON files in `backend/.mail/`. Open a file and use the link in its `text` field. **This doesn't send real emails, so use SMTP for the live email demo.** File mode is disabled in production, and the saved emails aren't publicly accessible.

## Demo checklist

| Feature | What to try |
| --- | --- |
| Registration and status | Sign up with required fields; try malformed email, phone, weak/mismatched passwords, incomplete address, invalid/expired card, and duplicate email. New accounts are `INACTIVE` and cannot log in. |
| Confirmation email | Open the real verification email and click **Verify email**. The account becomes `ACTIVE`. Reused or expired links fail; resend replaces earlier links. |
| Login validation | Try wrong credentials, inactive and suspended accounts, then a verified account. Customer lands on the catalog; administrator lands on `/admin`. |
| Admin prototype | The protected portal includes Manage Movies, Promotions, Users and Showtimes; each opens a page marked as a prototype. |
| Forgot password | Request a reset email, follow its link, and enter matching new passwords. Old passwords and existing sessions stop working. Links expire after 30 minutes and work once. |
| Logout | Use **Log out**; refreshing or revisiting `/profile` requires login. The server deletes the session, not just browser state. |
| Profile | Edit name, phone, the single home address, or promotional subscription. Reload to make sure it saved and check the notification email. Email is read-only and API updates to it are rejected. |
| Payment cards | Add, edit and remove cards. Only masked numbers are returned. Add three, then verify a fourth is rejected. You can only access your own cards, and the three-card limit also applies to requests sent at the same time. |
| Favorites | Tap a heart on a catalog card or detail page. View saved movies in My profile, reload to make sure it saved, follow a movie link, or remove a favorite. |
| Change password | Try an incorrect current password, then the correct one. Changing it successfully logs you out of all sessions and sends a notification email. |
| Usability | Required fields are marked; forms show errors, progress and confirmation. Pages adapt to mobile widths and controls have keyboard focus and accessible labels. |

### Setting up an admin account

Sign up and verify your email first. Then someone on the team with backend access can run this, replacing the example email with yours:

```sh
npm run make-admin --prefix backend -- verified-email@example.com
```

Log in again to get to the admin page. This only works for an existing, active account, and it logs that account out of any old sessions. There's no default admin password or option to sign up as an admin. The management pages are prototypes for this sprint.

## A few security details

- Passwords are hashed with Node's `scrypt` and a different random salt for each password. We don't send passwords back to the frontend or put them in emails.
- Saved card numbers and queued emails are encrypted with AES-256-GCM. The frontend only gets masked card details, and we don't store CVVs.
- Sessions expire after eight hours. The database stores hashes of session tokens, and cookies use HttpOnly and SameSite=Lax, plus Secure in production.
- Verification links expire after 24 hours. Password reset links expire after 30 minutes and only work once. Only token hashes are stored, and the links keep tokens out of server access logs by putting them in the URL fragment.
- The backend checks account status and permissions. Changing or resetting a password logs you out of all sessions.
- Requests that change data need JSON, a custom header, and an allowed origin. Login and other auth routes also have rate limits.
- Database queries use parameters. Users can't change their email, role, or account status through profile edits, and can only access their own cards and favorites.
- The new tables use row-level security to block direct anonymous access through Supabase's REST API.
- For production, use HTTPS, set `NODE_ENV=production`, and use an HTTPS `APP_URL`. If you add a reverse proxy, configure it explicitly; the server doesn't automatically trust forwarded client IPs.

## Supabase SSL setup

Download the server root certificate from **Supabase → Database settings → SSL configuration** and set `DB_SSL_CA_FILE` in `backend/.env` to its location. Paths are relative to `backend/`. For example:

```dotenv
DB_SSL_CA_FILE=certs/supabase-root.crt
```

With this certificate, the app can verify the database server's identity. Without it, the development connection is still encrypted, but the server's identity isn't checked. Production requires certificate verification for remote databases and won't connect if that check fails.

Our database needs the Supabase CA certificate, so this part of setup still needs to be finished once the team has it. See [Supabase's SSL instructions](https://supabase.com/docs/guides/database/connecting-to-postgres#ssl) for the details.
