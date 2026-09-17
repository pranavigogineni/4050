require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors    = require('cors');
const Database = require('better-sqlite3');
const path    = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ─── DATABASE SETUP ───────────────────────────────────────────────────────────
const databasePath = path.resolve(__dirname, process.env.SQLITE_DB_PATH || 'cinema.db');
const db = new Database(databasePath);
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS movies (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT    NOT NULL,
    genre        TEXT    NOT NULL,
    rating       TEXT    NOT NULL,
    description  TEXT    NOT NULL,
    cast_members TEXT    NOT NULL,
    director     TEXT    NOT NULL,
    poster       TEXT    NOT NULL,
    trailer_url  TEXT    NOT NULL,
    status       TEXT    NOT NULL CHECK(status IN ('running','coming_soon')),
    release_date TEXT
  );

  CREATE TABLE IF NOT EXISTS showtimes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    movie_id  INTEGER NOT NULL,
    show_time TEXT    NOT NULL,
    FOREIGN KEY(movie_id) REFERENCES movies(id)
  );
`);

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const { c: count } = db.prepare('SELECT COUNT(*) as c FROM movies').get();

if (count === 0) {
  const insM = db.prepare(`
    INSERT INTO movies
      (title, genre, rating, description, cast_members, director, poster, trailer_url, status, release_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insST = db.prepare('INSERT INTO showtimes (movie_id, show_time) VALUES (?, ?)');
  const defaultTimes = ['2:00 PM', '5:00 PM', '8:00 PM'];

  const movies = [
    // ── NOW SHOWING ──────────────────────────────────────────────────────────
    [
      'Dune: Part Three', 'Sci-Fi', 'PG-13',
      'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family. Facing a choice between love and the fate of the known universe, he must prevent a terrible future only he can foresee.',
      'Timothée Chalamet, Zendaya, Rebecca Ferguson', 'Denis Villeneuve',
      'https://image.tmdb.org/t/p/w500/d5NXSklpcuveUsGBl8lZa4i8wJ6.jpg',
      'https://www.youtube.com/embed/U2Qp5pL3ovA', 'running', null
    ],
    [
      'Oppenheimer', 'Drama', 'R',
      'The story of J. Robert Oppenheimer and his role in the development of the atomic bomb during WWII — exploring the moral weight of scientific discovery and its devastating consequences.',
      'Cillian Murphy, Emily Blunt, Matt Damon', 'Christopher Nolan',
      'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
      'https://www.youtube.com/embed/uYPbbksJxIg', 'running', null
    ],
    [
      'Alien: Romulus', 'Horror', 'R',
      'A group of young space colonizers come face to face with the most terrifying life form in the universe when they attempt to salvage an abandoned station drifting silently between two worlds.',
      'Cailee Spaeny, David Jonsson, Archie Renaux', 'Fede Álvarez',
      'https://image.tmdb.org/t/p/w500/b33nnKl1GSFbao4l3fZDDqsMx0F.jpg',
      'https://www.youtube.com/embed/8zU5TWJHHOU', 'running', null
    ],
    [
      'Inside Out 2', 'Animation', 'PG',
      'Riley is now a teenager and new emotions arrive at Headquarters threatening chaos. Anxiety, Envy, Ennui, and Embarrassment crash the party to compete with Joy and the original crew.',
      'Amy Poehler, Maya Hawke, Ayo Edebiri', 'Kelsey Mann',
      'https://image.tmdb.org/t/p/w500/vpnVM9B6NMmQpWeZvzLvDESb2QY.jpg',
      'https://www.youtube.com/embed/LEjhY15eCx0', 'running', null
    ],
    [
      'Kingdom of the Planet of the Apes', 'Action', 'PG-13',
      'Many years after Caesar\'s reign, a young ape questions everything he was taught and makes choices that define a future for apes and humans alike. A new chapter begins.',
      'Owen Teague, Freya Allan, Kevin Durand', 'Wes Ball',
      'https://image.tmdb.org/t/p/w500/gKkl37BQuKTanygYQG1pyYgLVgf.jpg',
      'https://www.youtube.com/embed/2lFLIFUUzJo', 'running', null
    ],
    [
      'Deadpool & Wolverine', 'Action', 'R',
      'Deadpool is recruited by the TVA and reluctantly teams up with a gruff Wolverine to face a threat that could end their universe — and maybe fix a few things along the way.',
      'Ryan Reynolds, Hugh Jackman, Emma Corrin', 'Shawn Levy',
      'https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg',
      'https://www.youtube.com/embed/73_1biulkYk', 'running', null
    ],
    // ── COMING SOON ──────────────────────────────────────────────────────────
    [
      'Venom: The Last Dance', 'Action', 'PG-13',
      'Eddie Brock and Venom are on the run, hunted by both worlds. Forced into a devastating decision, they must make their last move as the universe closes in around them.',
      'Tom Hardy, Juno Temple, Chiwetel Ejiofor', 'Kelly Marcel',
      'https://image.tmdb.org/t/p/w500/aosm8NMQ3UyoBVpSxyimorCQykC.jpg',
      'https://www.youtube.com/embed/KPbMEBkM8vI', 'coming_soon', 'Oct 25, 2024'
    ],
    [
      'Moana 2', 'Animation', 'PG',
      'Moana sets sail on the far seas of Oceania on an expansive new voyage with an unlikely crew after receiving an unexpected call from her wayfinding ancestors.',
      'Auli\'i Cravalho, Dwayne Johnson, Alan Tudyk', 'David Derrick Jr.',
      'https://image.tmdb.org/t/p/w500/4YZpsylmjHbqeWzjKpUEF8gcLNW.jpg',
      'https://www.youtube.com/embed/KNbUs6-91BI', 'coming_soon', 'Nov 27, 2024'
    ],
    [
      'Gladiator II', 'Action', 'R',
      'Lucius is forced into slavery and becomes a gladiator — battling through the Roman arenas to avenge those he lost and reclaim what was taken from him.',
      'Paul Mescal, Pedro Pascal, Denzel Washington', 'Ridley Scott',
      'https://image.tmdb.org/t/p/w500/2cxhvwyEwRlysAmRH4iodkvo0z5.jpg',
      'https://www.youtube.com/embed/jjlnE3Cxpb4', 'coming_soon', 'Nov 22, 2024'
    ],
    [
      'Wicked', 'Musical', 'PG',
      'Before one became good and the other became wicked, Elphaba and Glinda formed an unlikely friendship at Shiz University that would change the land of Oz forever.',
      'Cynthia Erivo, Ariana Grande, Jeff Goldblum', 'Jon M. Chu',
      'https://image.tmdb.org/t/p/w500/xDGbZ0JJ3mYaGKy4Nzd9Kph6M9L.jpg',
      'https://www.youtube.com/embed/6COmYeLsz4c', 'coming_soon', 'Nov 22, 2024'
    ],
  ];

  const seedAll = db.transaction(() => {
    movies.forEach(row => {
      const { lastInsertRowid: mid } = insM.run(...row);
      defaultTimes.forEach(t => insST.run(mid, t));
    });
  });
  seedAll();
  console.log('Seeded 10 movies into SQLite');
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// GET /api/movies  — supports ?search=title&genre=Genre
app.get('/api/movies', (req, res) => {
  const { search, genre } = req.query;
  let sql = 'SELECT * FROM movies WHERE 1=1';
  const params = [];

  if (search) {
    sql += ' AND LOWER(title) LIKE ?';
    params.push(`%${search.toLowerCase()}%`);
  }
  if (genre && genre !== '') {
    sql += ' AND LOWER(genre) = ?';
    params.push(genre.toLowerCase());
  }

  const movies = db.prepare(sql).all(...params);
  res.json(movies);
});

// GET /api/movies/:id  — single movie with showtimes array
app.get('/api/movies/:id', (req, res) => {
  const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Movie not found' });

  const rows = db.prepare(
    'SELECT show_time FROM showtimes WHERE movie_id = ? ORDER BY id'
  ).all(req.params.id);

  res.json({ ...movie, showtimes: rows.map(r => r.show_time) });
});

// GET /api/genres  — distinct genre list for filter dropdown
app.get('/api/genres', (req, res) => {
  const rows = db.prepare(
    'SELECT DISTINCT genre FROM movies ORDER BY genre'
  ).all();
  res.json(rows.map(r => r.genre));
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, () => {
  console.log(`CES Backend running at http://localhost:${server.address().port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
