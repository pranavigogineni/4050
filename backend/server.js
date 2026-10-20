const express = require('express');
const path    = require('path');
const { createPool, THEATRE_TIMEZONE } = require('./db/connection');
const { accountRoutes } = require('./accounts/routes');
const { startMailWorker } = require('./accounts/mail');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  next();
});

// ─── DATABASE ─────────────────────────────────────────────────────────────────
// Tables and sample data are created by `npm run db:setup` (see db/).
const pool = createPool();
app.use('/api', accountRoutes(pool));

// Express 4 does not pass rejected promises to the error handler on its own.
const route = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

// ─── RESPONSE FORMAT ──────────────────────────────────────────────────────────
// Responses keep the Sprint 1 field names so the frontend works unchanged;
// `genres`, `cast`, `producer` and `shows` expose the new schema.
const STATUS_NAMES = { NOW_PLAYING: 'running', COMING_SOON: 'coming_soon' };

// pg returns DATE columns as Date objects at local midnight, so read them in local time.
function formatDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isoDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// '14:00:00' → '2:00 PM'
function formatTime(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

function toApiMovie(movie, shows = []) {
  return {
    id: movie.id,
    title: movie.title,
    genre: movie.genres[0] ?? null,
    genres: movie.genres,
    rating: movie.rating.replace('_', '-'),
    description: movie.synopsis,
    cast_members: movie.cast_members.join(', '),
    cast: movie.cast_members,
    director: movie.director,
    producer: movie.producer,
    poster: movie.poster_image_url,
    trailer_url: movie.trailer_video_url,
    status: STATUS_NAMES[movie.status],
    release_date: movie.release_date && formatDate(movie.release_date),
    // Distinct daily times for the Sprint 1 pages; `shows` holds the dated schedule.
    showtimes: [...new Set(shows.map(show => show.show_time))].sort().map(formatTime),
    shows: shows.map(show => ({
      id: show.id,
      date: isoDate(show.show_date),
      time: formatTime(show.show_time),
      duration: show.duration,
      showroom: show.showroom,
    })),
  };
}

// ─── QUERIES ──────────────────────────────────────────────────────────────────
const MOVIE_COLUMNS = `m.*, ARRAY(
  SELECT g.name FROM movie_genres mg JOIN genres g ON g.id = mg.genre_id
  WHERE mg.movie_id = m.id ORDER BY g.name COLLATE "C") AS genres`;

// Shows that have not started yet, in the theatre's local time, grouped by movie id.
async function upcomingShows(movieIds) {
  const { rows } = await pool.query(
    `SELECT s.id, s.movie_id, s.show_date, s.show_time, s.duration, r.name AS showroom
     FROM shows s JOIN showrooms r ON r.id = s.showroom_id
     WHERE s.movie_id = ANY($1) AND s.starts_at >= now() AT TIME ZONE $2
     ORDER BY s.starts_at, s.id`,
    [movieIds, THEATRE_TIMEZONE]);
  const byMovie = new Map();
  for (const show of rows) {
    if (!byMovie.has(show.movie_id)) byMovie.set(show.movie_id, []);
    byMovie.get(show.movie_id).push(show);
  }
  return byMovie;
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// GET /api/movies  — supports ?search=title&genre=Genre
app.get('/api/movies', route(async (req, res) => {
  const { search, genre } = req.query;
  if ([search, genre].some(value => value !== undefined && typeof value !== 'string')) {
    return res.status(400).json({ error: 'Search and genre must each be a single text value.' });
  }
  const conditions = [];
  const params = [];

  // strpos matches literally, so % and _ in a search are not wildcards.
  if (search) {
    params.push(search.trim().toLowerCase());
    conditions.push(`strpos(lower(m.title), $${params.length}) > 0`);
  }
  if (genre) {
    params.push(genre.toLowerCase());
    conditions.push(`EXISTS (SELECT 1 FROM movie_genres mg JOIN genres g ON g.id = mg.genre_id
                             WHERE mg.movie_id = m.id AND lower(g.name) = $${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows: movies } = await pool.query(`SELECT ${MOVIE_COLUMNS} FROM movies m ${where} ORDER BY m.id`, params);
  const shows = await upcomingShows(movies.map(movie => movie.id));
  res.json(movies.map(movie => toApiMovie(movie, shows.get(movie.id))));
}));

// GET /api/movies/:id  — single movie with showtimes array
const MAX_ID = 2147483647; // largest PostgreSQL integer
app.get('/api/movies/:id', route(async (req, res) => {
  const id = Number(req.params.id);
  if (!/^[1-9]\d*$/.test(req.params.id) || id > MAX_ID) return res.status(404).json({ error: 'Movie not found' });
  const { rows: [movie] } = await pool.query(`SELECT ${MOVIE_COLUMNS} FROM movies m WHERE m.id = $1`, [id]);
  if (!movie) return res.status(404).json({ error: 'Movie not found' });

  const shows = await upcomingShows([movie.id]);
  res.json(toApiMovie(movie, shows.get(movie.id)));
}));

// GET /api/genres  — genres that have movies, for the filter dropdown
app.get('/api/genres', route(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT g.name FROM genres g
     WHERE EXISTS (SELECT 1 FROM movie_genres mg WHERE mg.genre_id = g.id)
     ORDER BY g.name COLLATE "C"`);
  res.json(rows.map(row => row.name));
}));

// Serve the production build from the same origin as the API.
app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found' }));
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  if (path.extname(req.path)) return res.status(404).send('Not found');
  res.sendFile(path.join(frontendDist, 'index.html'), error => {
    if (error) next(error);
  });
});
app.use((error, req, res, next) => {
  console.error(error.message);
  if (res.headersSent) return next(error);
  const status = [400, 404, 413].includes(error.status) ? error.status : 500;
  res.status(status).json({ error: status === 400 ? 'Invalid request data.' : 'Unable to complete the request.' });
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
let server;
let stopMail;

async function start() {
  try {
    await pool.query('SELECT 1 FROM movies LIMIT 1');
  } catch (error) {
    console.error(`Database is not ready: ${error.message}`);
    console.error('Run "npm run db:setup" in backend/ to create the tables and sample data.');
    await pool.end();
    process.exit(1);
  }
  server = app.listen(PORT, () => {
    console.log(`CES Backend running at http://localhost:${server.address().port}`);
  });
  stopMail = startMailWorker(pool);
}

function shutdown() {
  stopMail?.();
  if (!server) return process.exit(0);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}
start();
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
