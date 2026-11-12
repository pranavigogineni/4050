const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { createTestSchema, dropTestSchema } = require('../db/isolated-schema');
const { accountRoutes } = require('../accounts/routes');
const { token, digest, decrypt } = require('../accounts/security');
const schema = `test_cinema_${process.pid}_${Date.now()}`;
let pool, server, base, admin, customer, customerId;
async function request(path, body, cookie) {
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CineMax-Request': '1', Cookie: cookie || '' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  process.env.DATA_ENCRYPTION_KEY = require('node:crypto').randomBytes(32).toString('hex');
  pool = await createTestSchema(schema);
  for (const role of ['admin', 'customer']) {
    const { rows: [user] } = await pool.query(`INSERT INTO users (role,first_name,last_name,email,password_hash,phone_number,status)
      VALUES ($1,'Test','Cinema',$2,'unused','7065550100','ACTIVE') RETURNING id`, [role, `${role}@example.com`]);
    const raw = token();
    await pool.query("INSERT INTO user_sessions (token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')", [digest(raw), user.id]);
    if (role === 'admin') admin = `cinemax_session=${raw}`;
    else { customer = `cinemax_session=${raw}`; customerId = user.id; }
  }
  const app = express(); app.use(express.json()); app.use(accountRoutes(pool));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (pool) { await dropTestSchema(pool, schema); await pool.end(); }
});
test('admin adds validated movies and schedules non-overlapping shows across three rooms', async () => {
  assert.equal((await request('/admin/catalog')).status, 401);
  assert.equal((await request('/admin/catalog', undefined, customer)).status, 403);
  const { body: catalog } = await request('/admin/catalog', undefined, admin);
  assert.ok(catalog.showrooms.length >= 3);
  const body = { title: 'Sprint Three', director: 'Director', producer: 'Producer', cast_members: 'Actor One, Actor Two', synopsis: 'A test screening.',
    poster_image_url: 'https://example.com/poster.jpg', trailer_video_url: 'https://www.youtube.com/embed/abc123',
    rating: 'PG', status: 'NOW_PLAYING', genre_ids: [catalog.genres[0].id] };
  for (const invalid of [{ title: '' }, { genre_ids: [] }, { genre_ids: [999999] }, { rating: 'NR' }, { poster_image_url: 'javascript:alert(1)' }, { release_date: '2030-02-30' }]) {
    assert.equal((await request('/admin/movies', { ...body, ...invalid }, admin)).status, 400);
  }
  const movie = await request('/admin/movies', body, admin);
  assert.equal(movie.status, 201, JSON.stringify(movie.body));
  assert.equal((await pool.query('SELECT title FROM movies WHERE id=$1', [movie.body.id])).rows[0].title, body.title);
  const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const show = { movie_id: movie.body.id, show_date: future, show_time: '14:00', duration: 120 };
  for (const room of catalog.showrooms.slice(0, 3)) assert.equal((await request('/admin/shows', { ...show, showroom_id: room.id }, admin)).status, 201);
  assert.equal((await request('/admin/shows', { ...show, showroom_id: catalog.showrooms[0].id, show_time: '15:00' }, admin)).status, 409);
  const available = await request('/admin/available-showrooms', show, admin);
  assert.ok(!available.body.some(r => r.id === catalog.showrooms[0].id));
  assert.equal((await request('/admin/shows', { ...show, showroom_id: catalog.showrooms[0].id, show_time: '16:00' }, admin)).status, 201);
  assert.equal((await request('/admin/shows', { ...show, showroom_id: catalog.showrooms[0].id, show_date: '2000-01-01' }, admin)).status, 400);
});
test('seat maps and checkout validate ownership of seats, booked seats, prices, login and email', async () => {
  const { rows: [show] } = await pool.query("SELECT * FROM shows WHERE starts_at > now() AT TIME ZONE 'America/New_York' ORDER BY id LIMIT 1");
  const map = await request(`/shows/${show.id}/seats`);
  assert.equal(map.status, 200); assert.equal(map.body.seats.length, 70);
  const [seat, second] = map.body.seats;
  const type = map.body.ticket_types[0];
  const body = { show_id: show.id, tickets: [{ seat_id: seat.id, ticket_type_id: type.id }], subtotal: '0.01' };
  assert.equal((await request('/checkout/summary', body)).status, 401);
  assert.equal((await request('/checkout/summary', body, admin)).status, 403);
  const summary = await request('/checkout/summary', body, customer);
  assert.equal(summary.status, 200); assert.equal(summary.body.subtotal, type.price); assert.equal(summary.body.email, 'customer@example.com');
  assert.equal((await request('/checkout/summary', { ...body, tickets: [...body.tickets, ...body.tickets] }, customer)).status, 400);
  assert.equal((await request('/checkout/summary', { ...body, tickets: [{ seat_id: 999999, ticket_type_id: type.id }] }, customer)).status, 400);
  assert.equal((await request('/checkout/payment', { ...body, email: 'invalid' }, customer)).status, 400);
  const payment = await request('/checkout/payment', { ...body, email: 'different@example.com' }, customer);
  assert.equal(payment.status, 200); assert.equal(payment.body.email, 'different@example.com'); assert.equal(payment.body.mock, true);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n, 0);
  const { rows: [booking] } = await pool.query(`INSERT INTO bookings (customer_id,show_id,movie_title_snapshot,show_date_time_snapshot,subtotal,sales_tax,booking_fee,total_price,status)
    VALUES ($1,$2,'Booked movie',now(),13,0,0,13,'CONFIRMED') RETURNING id`, [customerId, show.id]);
  await pool.query(`INSERT INTO tickets (booking_id,show_id,showroom_id,seat_id,ticket_type_id,seat_label_snapshot,ticket_type_snapshot,price_paid)
    VALUES ($1,$2,$3,$4,$5,'A1','Adult',13)`, [booking.id, show.id, show.showroom_id, seat.id, type.id]);
  assert.equal((await request(`/shows/${show.id}/seats`)).body.seats.find(s => s.id === seat.id).booked, true);
  assert.equal((await request('/checkout/summary', body, customer)).status, 409);
  assert.equal((await request('/checkout/payment', { ...body, email: 'customer@example.com' }, customer)).status, 409);
  assert.equal((await request('/checkout/summary', { ...body, tickets: [{ seat_id: second.id, ticket_type_id: type.id }] }, customer)).status, 200);
});

test('promotion bonus validates input, queues only active subscribers, and honors opt-out before delivery', async () => {
  const { startMailWorker } = require('../accounts/mail');
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const recipients = [
    ['subscribed', 'customer', 'ACTIVE', true], ['optout', 'customer', 'ACTIVE', true],
    ['unsubscribed', 'customer', 'ACTIVE', false], ['inactive', 'customer', 'INACTIVE', true],
    ['suspended', 'customer', 'SUSPENDED', true], ['administrator', 'admin', 'ACTIVE', true],
  ];
  for (const [name, role, status, subscribed] of recipients) await pool.query(`INSERT INTO users
    (role,first_name,last_name,email,password_hash,phone_number,status,subscribed_to_promotions)
    VALUES ($1,'Promo','Test',$2,'unused','7065550100',$3,$4)`, [role, `${name}@example.com`, status, subscribed]);
  const start = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const body = { promo_code: 'bonus20', description: 'A movie night discount.', discount_percent: '20.50', start_date: start, end_date: end };
  assert.equal((await request('/admin/promotions')).status, 401);
  assert.equal((await request('/admin/promotions', body, customer)).status, 403);
  for (const invalid of [{ promo_code: '' }, { promo_code: 'INVALID CODE' }, { description: '' }, { discount_percent: 0 },
    { discount_percent: 101 }, { discount_percent: '1.234' }, { discount_percent: true }, { start_date: '2030-02-30' },
    { start_date: end, end_date: start }, { start_date: '2000-01-01', end_date: '2000-01-02' }]) {
    assert.equal((await request('/admin/promotions', { ...body, ...invalid }, admin)).status, 400);
  }
  const result = await request('/admin/promotions', body, admin);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.promo_code, 'BONUS20');
  assert.equal(result.body.queued_emails, 2);
  const mail = (await pool.query('SELECT encrypted_payload FROM email_outbox ORDER BY id')).rows
    .map(r => JSON.parse(decrypt(r.encrypted_payload, 'email')));
  assert.deepEqual(mail.map(m => m.to).sort(), ['optout@example.com', 'subscribed@example.com']);
  assert.match(mail[0].text, /20.5%/);
  assert.ok(mail[0].text.includes(start) && mail[0].text.includes(end));
  assert.equal((await request('/admin/promotions', { ...body, promo_code: 'BoNuS20' }, admin)).status, 409);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM email_outbox')).rows[0].n, 2);
  const listed = await request('/admin/promotions', undefined, admin);
  assert.equal(listed.body[0].discount_percent, '20.50');
  // A queue failure must roll back the promotion as well, allowing a safe retry.
  const key = process.env.DATA_ENCRYPTION_KEY;
  try {
    process.env.DATA_ENCRYPTION_KEY = '';
    assert.equal((await request('/admin/promotions', { ...body, promo_code: 'ROLLBACK' }, admin)).status, 503);
  } finally { process.env.DATA_ENCRYPTION_KEY = key; }
  assert.equal((await pool.query("SELECT id FROM promotions WHERE promo_code='ROLLBACK'")).rowCount, 0);
  await pool.query("UPDATE users SET subscribed_to_promotions=false WHERE email='optout@example.com'");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinemax-promo-test-'));
  const oldMode = process.env.MAIL_MODE, oldDir = process.env.MAIL_OUTPUT_DIR;
  process.env.MAIL_MODE = 'file'; process.env.MAIL_OUTPUT_DIR = dir;
  const stop = startMailWorker(pool);
  try {
    const deadline = Date.now() + 10000;
    while ((await pool.query('SELECT id FROM email_outbox WHERE sent_at IS NULL')).rowCount && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal((await pool.query('SELECT id FROM email_outbox WHERE sent_at IS NULL')).rowCount, 0);
    const files = await fs.readdir(dir);
    assert.equal(files.length, 1);
    const delivered = JSON.parse(await fs.readFile(path.join(dir, files[0]), 'utf8'));
    assert.equal(delivered.to, 'subscribed@example.com');
    assert.equal(delivered.promotionCustomerId, undefined);
  } finally {
    stop();
    if (oldMode === undefined) delete process.env.MAIL_MODE; else process.env.MAIL_MODE = oldMode;
    if (oldDir === undefined) delete process.env.MAIL_OUTPUT_DIR; else process.env.MAIL_OUTPUT_DIR = oldDir;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
