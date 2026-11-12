const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { createTestSchema, dropTestSchema } = require('../db/isolated-schema');
const { accountRoutes } = require('../accounts/routes');
const { token, digest } = require('../accounts/security');
const schema = `test_cinema_${process.pid}_${Date.now()}`;
let pool, server, base, admin, customer, customerId;
async function request(path, body, cookie) {
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CineMax-Request': '1', Cookie: cookie || '' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
before(async () => {
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
