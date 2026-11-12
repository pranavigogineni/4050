# Sprint 3 rubric audit

Audited 2026-11-12 against the three-page supplied Sprint 3 requirements/rubrics PDF.
Application commit reviewed: `1a94802` on `sprint-3`.

## Verdict

Required Sprint 3 feature paths and the promotion bonus are implemented and pass the
current database-backed automated tests. The environment is NOT fully demo-ready:
SMTP authentication fails (`EAUTH 535`), and the normal demo database has no booked
future seats to demonstrate unavailable-seat behavior. No application code was
changed during this audit. Passing these tests does not guarantee a particular grade
or coverage of the instructor's unpublished test cases.

## Verification performed

- Backend: `npm test --prefix backend` — 18/18 passed against disposable schemas.
- Browser: `npm test --prefix frontend` — 12/12 passed against a disposable database
  schema with locally captured email. The browser launcher builds the production UI.
- Read-only inspection of the normal demo database: 10 movies; 120 future shows;
  six showrooms, each with 70 actual seats matching capacity; Adult $12.99,
  Child $8.99, Senior $9.99; one active admin; seven active customers;
  two active subscribers; zero future booked seats; zero pending emails.
- SMTP host, sender and encryption key settings are present. A connection/authentication
  verification was attempted without sending a message: authentication rejected, EAUTH 535.
- Compared React pages, Express controllers/middleware, SQL schema, seed and test cases
  against every acceptance-criteria group in the PDF.

## Requirement-by-requirement findings

| PDF requirement | Finding and evidence |
| --- | --- |
| Admin menu: Movies, Promotions, Users, Showtimes | Implemented. Navigation exercised in Sprint 2 browser suite; Users intentionally explains excluded scope. |
| Add movie form completeness/validation (10) | Form includes title, cast, director, producer, synopsis, media URLs, rating, status, genres and optional release date. Browser required/type checks plus server validation. Invalid fields tested. Exact field completeness against the separate project specification cannot be confirmed without that document. |
| Movie stored correctly (5) | Transaction inserts movie and genre relationships. Integration tests verify persisted movie and browser customer page loads the created movie. |
| Schedule selected movie/date/time/showroom (15) | Admin browser test creates a dated show; API persists show and browser displays it for booking. |
| Scheduling usability (10) | Choose movie/date/time/duration, find available rooms, select room, confirm. Helpful validation and success messages. UI review supports usability; final grading is subjective. |
| At least three showrooms/test data (5) | Actual demo DB has six rooms with 70 seats each. Backend test schedules shows in three distinct rooms. |
| Prevent scheduling conflicts (5) | Database exclusion constraint covers overlapping intervals, not only identical start times. Tests reject overlap, omit occupied rooms and allow back-to-back shows. |
| Bonus: add promotion | Form and API validate unique case-insensitive code, description, discount and validity dates. Saved list persists after reload. Tests cover invalid and duplicate values. |
| Bonus: email only subscribers | Tests prove only active subscribed customers are queued; unsubscribed/inactive/suspended/admin accounts excluded. Worker rechecks opt-out before sending. Browser confirms captured subscriber email. REAL DELIVERY BLOCKED by SMTP authentication. |
| Showtimes visibility (5) | Movie API queries upcoming database shows. Detail page uses a date picker and displays the selected day's times/showrooms. Catalog/detail and newly scheduled show tested. |
| Start booking and age categories (5) | Show IDs preserve the exact movie/date/room. Adult/Child/Senior quantities and prices load from DB. Browser tests exercise category totals. |
| Seat layout/available vs booked (5) | Layout queries seats for the selected showroom. Existing non-cancelled tickets mark seats unavailable. API and browser tests insert a booked fixture and verify disabled/rejected seats. Demo DB itself currently needs a booked fixture. |
| Select seats | Interactive labelled buttons and selection summary; selection/deselection tested. |
| Reject booked seats | Disabled in UI; server revalidates both summary and payment-mockup requests. Tests pass. |
| Seat count matches ticket count | Continue disabled unless counts match and are nonzero. API requires one valid ticket type per distinct selected seat; duplicates/invalid seats rejected. |
| Preserve current session selection (seat selection group 15) | Browser-tab sessionStorage preserves seat/quantity draft through refresh and login. This is session-local persistence, not a database hold. Exclusive multi-user locking is explicitly deferred in the PDF. |
| Checkout requires login, then continues (2 within checkout group) | Protected checkout redirects guest to login and returns customer to the original checkout. Real-browser test confirms same selected seats. |
| Summary: movie, showtime, seats | Rendered from server-validated order data; checked in browser flow. |
| Summary: number/type of tickets, per-ticket price, subtotal (13 within checkout group) | Table shows one row per seat and ticket type, ticket count, unit price, total before tax. Server calculates prices from DB rather than accepting client totals. Mixed-category subtotal tested. |
| Existing or replacement confirmation email (5 within checkout group) | Account email prefilled; customer may change order email. Server validates; changing order email leaves profile email unchanged. Tested. |
| Payment processing mockup | Payment page displays order/email with disabled Pay button and explicit mockup text. No final order or payment created. Tested, including reload. |
| Layered architecture (10) | React views/API client → Express authenticated route/application layer → PostgreSQL schema/queries. Mail delivery handled by outbox worker. README explains decomposition; team must explain it during demo. |
| UX: clear UI, prompts, errors, required fields (5) | Required markers, native form constraints, focused error notices, keyboard focus styles and loading/success states. Mobile/catalog/booking/account behavior tested. Usability is not a guaranteed rubric score. |
| Data integrity/client + server validation (5) | Parameterized SQL, auth/role checks, transactions, foreign keys, unique keys, overlap exclusion; server validates fields, seat ownership, duplicate selections, prices and email. Negative tests pass. |
| Seed and test readiness (5) | Movie/showroom/seat/ticket/show seeds present. Scheduling, visibility, booking and seat cases covered. Refresh future shows before demo; prepare booked-seat data in demo environment. |
| Continuous user/admin flows | Real-browser test creates movie/show as admin, logs out, selects seats as guest, logs in as customer, reviews summary and reaches payment mockup. |

The PDF groups the checkout criteria under 20 points and seat criteria under 15;
individual subrows above are not separate additional point claims.

## Explicitly excluded/deferred by the PDF

Movie edit/delete, user management, real payment processing, final booking
confirmation, real-time seat locking/concurrency, and automatic five-minute
unlocking. The checkout heading mentions email confirmation, but its detailed
criteria specify confirming/changing the address and stopping at the payment
mockup; they do not require sending a final booking-confirmation email.

## Remaining actions before the demo

1. Fix SMTP authentication in backend/.env/provider settings (SMTP_USER, SMTP_PASS,
   and provider requirements). Do not share or commit credentials. Restart the app,
   then verify actual registration/reset and promotion emails using team-controlled
   inboxes. SMTP verification alone cannot prove inbox delivery.
2. Prepare a labelled demo booking/ticket for a future show so the normal app visibly
   has an unavailable seat. The automated tests create this only in test schemas;
   they do not add fake purchases to the shared demo catalog.
3. Rehearse both flows using a verified admin and separate customer. Demonstrate
   shows in three rooms, blocked conflicts, invalid input, and subscribed vs
   unsubscribed inboxes. Be able to explain the layers and session-local selection.
4. Team leader signs up for a demo; at least two members demonstrate within the
   assigned time. Submit the correct branch/repository link or complete source zip.
   The optional existing packaging helper still names its output cesrepo-sprint2.zip;
   if choosing a zip, use a Sprint 3 name and verify contents exclude credentials.
5. Review prior-sprint instructor feedback and the separate project specification /
   detailed user stories referenced by the PDF. Those materials and private
   instructor test cases were not provided, so compliance with additional details
   cannot be certified by this audit.

No real emails were sent and no normal demo data was modified by this audit.

## Follow-up: booked-seat fixture added

After this audit, the requested demo setup was implemented and run. Seat A1 for
Dune: Part Two on 2026-11-12 at 17:00 Eastern, Showroom 1, is now a zero-dollar
DEMO booking (show ID 1646). Run `npm run demo:booked-seat --prefix backend` again
when this show is past; it prepares the next upcoming show and prints its link.
The earlier zero-booked-seat observation is historical and is now addressed.
A disposable-schema integration test verifies repeatability and no email/payment.
SMTP authentication remains a separate unresolved configuration issue.
