// Sprint 3 application layer. Reservations are session-local until final-demo checkout.
const express = require('express');
const { fail } = require('../accounts/security');
const validate = require('../accounts/validation');
const { THEATRE_TIMEZONE } = require('../db/connection');
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
function text(value, label, max = 200, multiline = false) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || (multiline ? /[\x00-\x08\x0b\x0c\x0e-\x1f]/ : /[\x00-\x1f]/).test(value)) fail(`Enter a valid ${label}.`);
  return value.trim();
}
function integer(value, label, max = 2147483647) {
  if (!Number.isInteger(value) || value < 1 || value > max) fail(`Enter a valid ${label}.`);
  return value;
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('Enter a valid date.');
  return value;
}
function url(value, label, trailer = false) {
  const result = text(value, label, 2000);
  let parsed;
  try { parsed = new URL(result); } catch { fail(`Enter a valid ${label}.`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) fail(`${label} must be an HTTPS URL.`);
  if (trailer && (!['www.youtube.com', 'www.youtube-nocookie.com'].includes(parsed.hostname) || !/^\/embed\/[A-Za-z0-9_-]+$/.test(parsed.pathname))) fail('Use a YouTube embed URL for the trailer.');
  return result;
}
function schedule(body) {
  const day = date(body.show_date);
  if (typeof body.show_time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.show_time)) fail('Enter a valid show time.');
  return [day, body.show_time, integer(Number(body.duration), 'duration (1–600 minutes)', 600)];
}
function cinemaRoutes(pool, { requireUser, customer, transaction }) {
  const router = express.Router();
  const admin = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Administrator access is required.' });
  router.get('/admin/catalog', requireUser, admin, wrap(async (req, res) => {
    const movies = await pool.query('SELECT id, title FROM movies ORDER BY title');
    const rooms = await pool.query('SELECT id, name, seat_capacity FROM showrooms ORDER BY name');
    const genres = await pool.query('SELECT id, name FROM genres ORDER BY name');
    res.json({ movies: movies.rows, showrooms: rooms.rows, genres: genres.rows, timezone: THEATRE_TIMEZONE });
  }));
  router.post('/admin/movies', requireUser, admin, wrap(async (req, res) => {
    const b = req.body || {};
    const fields = [text(b.title, 'title'), text(b.director, 'director'), text(b.producer, 'producer'), text(b.synopsis, 'synopsis', 5000, true), url(b.poster_image_url, 'Poster URL'), url(b.trailer_video_url, 'Trailer URL', true)];
    const cast = text(b.cast_members, 'cast', 2000).split(',').map(s => s.trim());
    if (cast.some(s => !s)) fail('Separate cast names with commas.');
    if (!['G', 'PG', 'PG_13', 'R', 'NC_17'].includes(b.rating)) fail('Choose a valid rating.');
    if (!['NOW_PLAYING', 'COMING_SOON'].includes(b.status)) fail('Choose a valid movie status.');
    if (!Array.isArray(b.genre_ids) || !b.genre_ids.length || b.genre_ids.length > 30) fail('Choose at least one genre.');
    const genres = [...new Set(b.genre_ids.map(id => integer(id, 'genre')))];
    const release = b.release_date ? date(b.release_date) : null;
    const movie = await transaction(pool, async db => {
      if ((await db.query('SELECT id FROM genres WHERE id = ANY($1::int[])', [genres])).rowCount !== genres.length) fail('Choose existing genres.');
      const { rows: [theatre] } = await db.query('SELECT id FROM theatres');
      if (!theatre) fail('Seed the cinema before adding movies.', 409);
      const { rows: [created] } = await db.query(`INSERT INTO movies
        (title,director,producer,synopsis,poster_image_url,trailer_video_url,cast_members,rating,status,release_date,theatre_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,title`, [...fields, cast, b.rating, b.status, release, theatre.id]);
      await db.query('INSERT INTO movie_genres (movie_id,genre_id) SELECT $1,unnest($2::int[])', [created.id, genres]);
      return created;
    });
    res.status(201).json(movie);
  }));
  router.post('/admin/available-showrooms', requireUser, admin, wrap(async (req, res) => {
    const [day, time, duration] = schedule(req.body || {});
    const { rows } = await pool.query(`SELECT r.id,r.name,r.seat_capacity FROM showrooms r WHERE NOT EXISTS
      (SELECT 1 FROM shows s WHERE s.showroom_id=r.id AND
       tsrange(s.starts_at,s.ends_at) && tsrange($1::date + $2::time,$1::date + $2::time + $3 * interval '1 minute')) ORDER BY r.name`, [day, time, duration]);
    res.json(rows);
  }));
  router.post('/admin/shows', requireUser, admin, wrap(async (req, res) => {
    const b = req.body || {};
    const [day, time, duration] = schedule(b);
    const movie = integer(b.movie_id, 'movie');
    const room = integer(b.showroom_id, 'showroom');
    const { rows: [valid] } = await pool.query(`SELECT m.id FROM movies m JOIN showrooms r ON r.theatre_id=m.theatre_id
      WHERE m.id=$1 AND r.id=$2 AND ($3::date + $4::time) > now() AT TIME ZONE $5`, [movie, room, day, time, THEATRE_TIMEZONE]);
    if (!valid) fail('Choose an existing movie, showroom, and future showtime.');
    try {
      const { rows: [show] } = await pool.query(`INSERT INTO shows (movie_id,showroom_id,show_date,show_time,duration)
        VALUES ($1,$2,$3,$4,$5) RETURNING id`, [movie, room, day, time, duration]);
      res.status(201).json(show);
    } catch (error) {
      if (error.code === '23P01') fail('This showroom has an overlapping show. Choose another room or time.', 409);
      throw error;
    }
  }));
  async function showData(id) {
    const { rows: [show] } = await pool.query(`SELECT s.id,s.movie_id,s.showroom_id,s.show_date::text AS date,s.show_time::text AS time,
      s.duration,m.title,m.poster_image_url AS poster,r.name AS showroom FROM shows s
      JOIN movies m ON m.id=s.movie_id JOIN showrooms r ON r.id=s.showroom_id
      WHERE s.id=$1 AND s.starts_at > now() AT TIME ZONE $2`, [id, THEATRE_TIMEZONE]);
    if (!show) fail('This showtime is not available. Please select a listed showtime.', 404);
    const { rows: seats } = await pool.query(`SELECT s.id,s.row_label,s.seat_number,
      EXISTS(SELECT 1 FROM tickets t WHERE t.show_id=$1 AND t.seat_id=s.id AND NOT t.cancelled) AS booked
      FROM seats s WHERE s.showroom_id=$2 ORDER BY s.row_label,s.seat_number`, [id, show.showroom_id]);
    const { rows: ticket_types } = await pool.query('SELECT id,name,age_criteria,price FROM ticket_types ORDER BY id');
    return { show, seats, ticket_types };
  }
  router.get('/shows/:id/seats', wrap(async (req, res) => res.json(await showData(integer(Number(req.params.id), 'showtime')))));
  async function summary(body) {
    const data = await showData(integer(body.show_id, 'showtime'));
    if (!Array.isArray(body.tickets) || !body.tickets.length || body.tickets.length > data.seats.length) fail('Choose one ticket for each selected seat.');
    const seen = new Set();
    let subtotal = 0;
    const tickets = body.tickets.map(item => {
      if (!item || typeof item !== 'object') fail('Choose valid tickets.');
      const seat = data.seats.find(s => s.id === item.seat_id);
      const type = data.ticket_types.find(t => t.id === item.ticket_type_id);
      if (!seat || !type || seen.has(seat.id)) fail('Choose distinct seats in this showroom and valid ticket types.');
      if (seat.booked) fail(`Seat ${seat.row_label}${seat.seat_number} is already booked. Please choose another seat.`, 409);
      seen.add(seat.id);
      const cents = Math.round(Number(type.price) * 100);
      subtotal += cents;
      return { seat_id: seat.id, seat: `${seat.row_label}${seat.seat_number}`, ticket_type_id: type.id, type: type.name, price: (cents / 100).toFixed(2) };
    });
    return { show: data.show, tickets, subtotal: (subtotal / 100).toFixed(2) };
  }
  router.post('/checkout/summary', requireUser, customer, wrap(async (req, res) => {
    res.json({ ...await summary(req.body || {}), email: req.user.email });
  }));
  router.post('/checkout/payment', requireUser, customer, wrap(async (req, res) => {
    const email = validate.email(req.body?.email);
    res.json({ ...await summary(req.body || {}), email, mock: true });
  }));
  return router;
}
module.exports = { cinemaRoutes };
