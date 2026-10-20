# Sprint 2 implementation and demo

This implements the supplied Deliverable 5 rubric. The separate project specification and Sprint 1 feedback were not supplied. Field choices below follow the existing database design: required first name, last name, email, phone and password; optional home address, payment card and promotional subscription.

## Start locally

From the project root:

```sh
npm ci --prefix backend
npm ci --prefix frontend
npm run configure:accounts --prefix backend
npm run migrate --prefix backend
npm run build --prefix frontend
npm start --prefix backend
```

The configure command preserves existing settings and creates a random `DATA_ENCRYPTION_KEY` only if one is missing. Keep this secret key backed up and use the same key for all servers sharing this database. Replacing it makes existing encrypted cards and pending emails unreadable. Never commit `.env`. Migrations add account tables and card metadata without replacing catalog data; `db:setup` is only necessary if the catalog has not been seeded.

For separate Vite/backend development, use the existing two `npm run dev` commands and set `APP_URL=http://localhost:3000`. For the combined production build, use `APP_URL=http://localhost:5001`.

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

For local development only, `MAIL_MODE=file` writes messages to the ignored `backend/.mail/` directory. This does **not** send email and does **not** satisfy the rubric's live email demo. Open a JSON file locally and follow the URL in its `text` field. There is no public inbox endpoint. Production disables file mode.

## Demo checklist

| Requirement | Demonstration |
| --- | --- |
| Registration and status | Sign up with required fields; try malformed email, phone, weak/mismatched passwords, incomplete address, invalid/expired card, and duplicate email. New accounts are `INACTIVE` and cannot log in. |
| Confirmation email | Open the real verification email and click **Verify email**. The account becomes `ACTIVE`. Reused or expired links fail; resend replaces earlier links. |
| Login validation | Try wrong credentials, inactive and suspended accounts, then a verified account. Customer lands on the catalog; administrator lands on `/admin`. |
| Admin prototype | The protected portal includes Manage Movies, Promotions, Users and Showtimes; each opens an explicitly labelled prototype workspace. |
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

Log in again. The script promotes only an existing active account and invalidates its sessions. There are no hardcoded admin credentials, public role-change endpoints, or admin registration options. Movie, promotion, user and showtime management operations themselves are outside this sprint's prototype requirement.

## Security behavior

- Passwords use per-password random salts and Node's `scrypt` (`N=32768`, `r=8`, `p=3`); passwords are never returned or emailed.
- Card numbers and pending email bodies use AES-256-GCM with fresh random IVs and context binding. Card APIs return only the last four digits and non-secret metadata. No CVV is accepted for storage.
- Sessions are random opaque tokens; only hashes are stored in PostgreSQL. Cookies are HttpOnly, SameSite=Lax, and Secure in production. Sessions expire after eight hours.
- Verification links expire after 24 hours; reset links after 30 minutes. Only token hashes are stored. Email URLs put tokens in the fragment so they do not appear in server access logs.
- Authenticated endpoints check the database account status and role. Password changes/reset revoke all sessions. Session creation rechecks credentials under a row lock.
- Writes require a custom header, JSON and an allowed origin. CORS is not opened to arbitrary origins. Auth endpoints have database-backed rate limits.
- SQL is parameterized. Users cannot modify their email, role or status through profile updates. Card access is scoped by owner; favorites are unique per customer/movie.
- New tables enable row-level security to block direct anonymous Supabase REST access, matching the existing architecture.
- In production use HTTPS with `NODE_ENV=production` and an HTTPS `APP_URL`. Configure a trusted reverse proxy deliberately if adding one; the server does not blindly trust forwarded client IPs.

## Validation

```sh
npm test --prefix backend
npm test --prefix frontend
```

Both suites use disposable `test_*` schemas, preserving the demo catalog. Set `TEST_DATABASE_URL` to target a separate database. Backend tests exercise the real PostgreSQL schema, account API, encryption, token/session lifecycles, access restrictions, ownership, favorites, concurrency, throttling and email queue delivery. Browser tests run the built app in Chrome and cover Sprint 1 plus registration, verification, profile/card/favorite changes, password change/reset, role navigation and mobile layout. Test emails are captured locally; tests never send mail to the sample addresses.

Development uses Node's built-in `--watch` support instead of nodemon. Use Node 20.19 or newer (the audit ran on 20.20.2). The browser test launcher explicitly builds the frontend in production mode while keeping the test backend's email capture isolated.

### Database certificate verification

Download the server root certificate from **Supabase → Database settings → SSL configuration** and set `DB_SSL_CA_FILE` in `backend/.env` to its location. Relative paths resolve from `backend/`. For example:

```dotenv
DB_SSL_CA_FILE=certs/supabase-root.crt
```

Supplying this file enables certificate verification in development. Production always requires verified TLS for remote databases and fails closed if the certificate cannot be verified. Without a certificate configured, the existing development connection remains encrypted but does not authenticate the database server. The audit confirmed this project's certificate chain needs a supplied CA; do not mark this configuration check complete until the teammate supplies it. See [Supabase's SSL instructions](https://supabase.com/docs/guides/database/connecting-to-postgres#ssl).

The Sprint 1 booking flow remains a prototype. Payments, real reservations and full administrative CRUD are not requirements in the supplied Sprint 2 rubric.
