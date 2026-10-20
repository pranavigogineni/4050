// Backend integration tests for the CineMax API and the database rules.
// Each run migrates and seeds a throwaway schema (see db/isolated-schema.js), launches the
// real Express server against it as a child process, and drops the schema afterwards.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const os = require('node:os');
const path = require('node:path');
const { createTestSchema, dropTestSchema, testDatabaseUrl } = require('../db/isolated-schema');
const { seed } = require('../db/seed');

const schema = `test_${process.pid}_${Date.now()}`;
let pool;

before(async () => { pool = await createTestSchema(schema); });
after(async () => {
  if (!pool) return;
  await dropTestSchema(pool, schema);
  await pool.end();
});

async function start(cwd) {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    cwd,
    env: { ...process.env, PORT: '0', DATABASE_URL: testDatabaseUrl(), DB_SCHEMA: schema },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';

  // Wait until the server prints its URL.
  // Fail if it errors, exits early, or takes longer than 15 seconds.
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${output}`));
    }, 15000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Server exited (${code}): ${output}`));
    });
    child.stderr.on('data', data => { output += data; });
    child.stdout.on('data', data => {
      output += data;
      const match = output.match(/http:\/\/localhost:\d+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
  });
  return {
    async get(route) {
      const response = await fetch(`${url}/api${route}`);
      return { status: response.status, body: await response.json() };
    },
    async stop() {
      if (child.exitCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('API serves the seeded catalog with search, filters and showtimes', async t => {
  // Start outside backend/ to verify configuration paths are stable.
  const server = await start(os.tmpdir());
  t.after(() => server.stop());

  const movies = await server.get('/movies');
  assert.equal(movies.status, 200);
  assert.equal(movies.body.length, 10);
  assert.deepEqual([...new Set(movies.body.map(m => m.status))].sort(), ['coming_soon', 'running']);
  assert.ok(new Set(movies.body.map(m => m.genre)).size > 1);
  const [dune] = movies.body;
  assert.equal(dune.title, 'Dune: Part Two');
  assert.equal(dune.rating, 'PG-13');
  assert.match(dune.poster, /1pdfLvkbY9ohJlCjQH2CZjjYVvJ/);
  assert.equal(dune.cast_members, 'Timothée Chalamet, Zendaya, Rebecca Ferguson');
  assert.deepEqual(dune.genres, ['Sci-Fi']);

  for (const movie of movies.body) {
    const running = movie.status === 'running';
    assert.deepEqual(movie.showtimes, running ? ['2:00 PM', '5:00 PM', '8:00 PM'] : []);
    // At least the six days after today are fully scheduled.
    assert.ok(running ? movie.shows.length >= 18 : movie.shows.length === 0);
    for (const show of movie.shows) {
      assert.match(show.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(movie.showtimes.includes(show.time));
      assert.match(show.showroom, /^Showroom \d$/);
    }
    const detail = await server.get(`/movies/${movie.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.title, movie.title);
    assert.deepEqual(detail.body.showtimes, movie.showtimes);
  }

  assert.equal((await server.get('/movies?search=uNe')).body.length, 1);
  const actions = (await server.get('/movies?genre=aCtIoN')).body;
  assert.equal(actions.length, 4);
  assert.ok(actions.every(movie => movie.genre === 'Action'));
  assert.equal((await server.get('/movies?search=DUNE&genre=sci-fi')).body.length, 1);
  assert.deepEqual((await server.get('/movies?search=DUNE&genre=action')).body, []);
  assert.deepEqual((await server.get('/movies?search=nonexistent-title')).body, []);
  assert.deepEqual((await server.get('/movies?genre=nonexistent-genre')).body, []);
  assert.deepEqual((await server.get('/movies?search=%27%20OR%201%3D1--')).body, []);
  for (const query of ['search=%25', 'search=_', 'search=%5C%5C']) {
    assert.deepEqual((await server.get(`/movies?${query}`)).body, []);
  }
  for (const query of ['search=Dune&search=Wicked', 'genre[]=Action', 'search[x]=Dune']) {
    const invalid = await server.get(`/movies?${query}`);
    assert.equal(invalid.status, 400);
    assert.match(invalid.body.error, /single text value/);
  }
  assert.equal((await server.get('/movies?search=%20DUNE%20')).body.length, 1);
  assert.equal((await server.get('/movies/not-an-id')).status, 404);
  assert.equal((await server.get('/movies/99999')).status, 404);
  assert.equal((await server.get('/movies/99999999999')).status, 404);
  assert.equal((await server.get('/unknown')).status, 404);
  const genres = await server.get('/genres');
  assert.equal(genres.status, 200);
  assert.deepEqual(genres.body, [...new Set(movies.body.map(m => m.genre))].sort());
});

test('re-running the seed keeps edits and adds no duplicates', async () => {
  await pool.query("UPDATE movies SET title = 'Dune: Part Three' WHERE title = 'Dune: Part Two'");
  assert.deepEqual(await seed(pool), { catalogSeeded: false, showsAdded: 0 });
  const { rows: [counts] } = await pool.query(
    `SELECT (SELECT count(*)::int FROM movies) AS movies,
            (SELECT count(*)::int FROM showrooms) AS showrooms,
            (SELECT count(*)::int FROM seats) AS seats,
            (SELECT count(*)::int FROM ticket_types) AS ticket_types,
            (SELECT count(*)::int FROM movies WHERE title = 'Dune: Part Three') AS edited`);
  assert.deepEqual(counts, { movies: 10, showrooms: 6, seats: 420, ticket_types: 3, edited: 1 });
});

test('database constraints enforce the domain rules', async () => {
  const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
  const show = await one('SELECT id, showroom_id FROM shows ORDER BY id LIMIT 1');
  const otherShow = await one('SELECT id, showroom_id FROM shows WHERE id <> $1 ORDER BY id LIMIT 1', [show.id]);
  const [seatA, seatB] = (await pool.query(
    'SELECT id FROM seats WHERE showroom_id = $1 ORDER BY id LIMIT 2', [show.showroom_id])).rows;
  const otherRoomSeat = await one('SELECT id FROM seats WHERE showroom_id <> $1 LIMIT 1', [show.showroom_id]);
  const adult = await one("SELECT id FROM ticket_types WHERE name = 'Adult'");

  // Exactly one theatre exists.
  await assert.rejects(pool.query(
    "INSERT INTO theatres (name) VALUES ('Second')"),
  { code: '23505' });

  // Shows in the same showroom cannot overlap, but may run back to back.
  await assert.rejects(pool.query(
    `INSERT INTO shows (movie_id, showroom_id, show_date, show_time, duration)
     SELECT movie_id, showroom_id, show_date, show_time + interval '30 minutes', 60 FROM shows WHERE id = $1`,
    [show.id]), { code: '23P01' });
  await pool.query(
    `INSERT INTO shows (movie_id, showroom_id, show_date, show_time, duration)
     SELECT movie_id, showroom_id, show_date, show_time - interval '1 hour', 60 FROM shows WHERE id = $1`,
    [show.id]);

  // Emails are unique regardless of case.
  const addUser = (email, role, address = [null, null, null, null]) => pool.query(
    `INSERT INTO users (role, first_name, last_name, email, password_hash, phone_number, street, city, state, zip_code)
     VALUES ($1, 'Test', 'User', $2, 'hash', '706-555-0100', $3, $4, $5, $6) RETURNING id`,
    [role, email, ...address]);
  const { rows: [user] } = await addUser('test@example.com', 'customer', ['1 Main St', 'Athens', 'GA', '30602']);
  await assert.rejects(addUser('TEST@example.com', 'admin'), { code: '23505' });
  await addUser('admin@example.com', 'admin');

  // A customer can store at most three payment cards.
  const addCard = () => pool.query(
    `INSERT INTO payment_cards (customer_id, encrypted_card_number, card_holder_name, expiration_date)
     VALUES ($1, 'encrypted', 'Test User', '2030-01-31') RETURNING id`, [user.id]);
  const { rows: [card] } = await addCard();
  await addCard();
  await addCard();
  await assert.rejects(addCard(), { code: '23514' });

  // Two bookings for the same show.
  const addBooking = total => pool.query(
    `INSERT INTO bookings (customer_id, show_id, payment_card_id, movie_title_snapshot, show_date_time_snapshot,
                           subtotal, sales_tax, booking_fee, total_price, payment_status)
     SELECT $1, id, $2, 'Dune: Part Two', starts_at, 12.99, 1.04, 1.50, $3, 'PAID' FROM shows WHERE id = $4
     RETURNING id`, [user.id, card.id, total, show.id]);
  const { rows: [booking] } = await addBooking('15.53');
  const { rows: [secondBooking] } = await addBooking('15.53');

  const addTicket = (bookingId, seatId, { showId = show.id, showroomId = show.showroom_id } = {}) => pool.query(
    `INSERT INTO tickets (booking_id, show_id, showroom_id, seat_id, ticket_type_id,
                          seat_label_snapshot, ticket_type_snapshot, price_paid)
     VALUES ($1, $2, $3, $4, $5, 'A1', 'Adult', 12.99) RETURNING id`,
    [bookingId, showId, showroomId, seatId, adult.id]);

  // One active ticket per show and seat; cancelling frees the seat.
  const { rows: [ticket] } = await addTicket(booking.id, seatA.id);
  await assert.rejects(addTicket(secondBooking.id, seatA.id), { code: '23505' });
  await pool.query('UPDATE tickets SET cancelled = true WHERE id = $1', [ticket.id]);
  await addTicket(secondBooking.id, seatA.id);

  // The seat must be in the show's showroom, and the ticket must be for the booking's show.
  await assert.rejects(addTicket(booking.id, otherRoomSeat.id), { code: '23503' });
  await assert.rejects(addTicket(booking.id, seatB.id, { showId: otherShow.id, showroomId: otherShow.showroom_id }),
    { code: '23503' });

  // Only one hold may exist per show and seat.
  const addSelection = () => one(
    `INSERT INTO booking_selections (customer_id, show_id, hold_expires_at)
     VALUES ($1, $2, now() + interval '5 minutes') RETURNING id`, [user.id, show.id]);
  const hold = selectionId => pool.query(
    'INSERT INTO selected_seats (selection_id, show_id, showroom_id, seat_id) VALUES ($1, $2, $3, $4)',
    [selectionId, show.id, show.showroom_id, seatB.id]);
  await hold((await addSelection()).id);
  await assert.rejects(hold((await addSelection()).id), { code: '23505' });
});

test('row-level security is enabled on every table', async () => {
  const { rows } = await pool.query(
    `SELECT relname FROM pg_class
     WHERE relnamespace = $1::regnamespace AND relkind = 'r' AND NOT relrowsecurity`, [schema]);
  assert.deepEqual(rows, []);
});
