require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS movies (
      id           SERIAL PRIMARY KEY,
      title        TEXT NOT NULL,
      genre        TEXT NOT NULL,
      rating       TEXT NOT NULL,
      description  TEXT NOT NULL,
      cast_members TEXT NOT NULL,
      director     TEXT NOT NULL,
      poster       TEXT NOT NULL,
      trailer_url  TEXT NOT NULL,
      status       TEXT NOT NULL CHECK(status IN ('running','coming_soon')),
      release_date TEXT
    );

    CREATE TABLE IF NOT EXISTS showtimes (
      id        SERIAL PRIMARY KEY,
      movie_id  INTEGER NOT NULL REFERENCES movies(id),
      show_time TEXT NOT NULL
    );
  `);
}

// get movies
app.get('/api/movies', async (req, res) => {
  const { search, genre } = req.query;
  let sql = 'SELECT * FROM movies WHERE 1=1';
  const params = [];

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    sql += ` AND LOWER(title) LIKE $${params.length}`;
  }
  if (genre && genre !== '') {
    params.push(genre.toLowerCase());
    sql += ` AND LOWER(genre) = $${params.length}`;
  }

  try {
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// get movies by id
app.get('/api/movies/:id', async (req, res) => {
  try {
    const { rows: [movie] } = await pool.query('SELECT * FROM movies WHERE id = $1', [req.params.id]);
    if (!movie) return res.status(404).json({ error: 'Movie not found' });

    const { rows } = await pool.query(
      'SELECT show_time FROM showtimes WHERE movie_id = $1 ORDER BY id',
      [req.params.id]
    );

    res.json({ ...movie, showtimes: rows.map(r => r.show_time) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// get genres
app.get('/api/genres', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT DISTINCT genre FROM movies ORDER BY genre');
    res.json(rows.map(r => r.genre));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// start server
const PORT = process.env.PORT || 5001;

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
