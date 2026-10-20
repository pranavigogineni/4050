// Loads the sample catalog once and keeps the next week of shows scheduled.
// Safe to re-run: existing data is left alone and only missing shows are added.
//   npm run seed
const { createPool, THEATRE_TIMEZONE } = require('./connection');

const SEED_LOCK_ID = 405005; // serializes concurrent seed runs
const SHOW_TIMES = ['14:00', '17:00', '20:00'];
const SHOWROOM_ROWS = 7;   // A–G, matching the booking page's seat map
const SEATS_PER_ROW = 10;
const SHOWROOM_COUNT = 6;  // one per now-playing movie, so all three daily shows fit

const THEATRE = { name: 'CineMax', bookingFee: '1.50', taxRate: '0.0800' };

const TICKET_TYPES = [
  { name: 'Adult', ageCriteria: 'Ages 12–64', price: '12.99' },
  { name: 'Child', ageCriteria: 'Under 12', price: '8.99' },
  { name: 'Senior', ageCriteria: 'Ages 65+', price: '9.99' },
];

// `runtime` (minutes) sets the duration of the movie's shows.
const MOVIES = [
  // ── NOW PLAYING ────────────────────────────────────────────────────────────
  {
    title: 'Dune: Part Two', genre: 'Sci-Fi', rating: 'PG_13', runtime: 166, status: 'NOW_PLAYING',
    synopsis: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family. Facing a choice between love and the fate of the known universe, he must prevent a terrible future only he can foresee.',
    cast: ['Timothée Chalamet', 'Zendaya', 'Rebecca Ferguson'], director: 'Denis Villeneuve',
    producer: 'Mary Parent, Cale Boyter, Tanya Lapointe, Denis Villeneuve',
    poster: 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
    trailer: 'https://www.youtube.com/embed/U2Qp5pL3ovA',
  },
  {
    title: 'Oppenheimer', genre: 'Drama', rating: 'R', runtime: 180, status: 'NOW_PLAYING',
    synopsis: 'The story of J. Robert Oppenheimer and his role in the development of the atomic bomb during WWII — exploring the moral weight of scientific discovery and its devastating consequences.',
    cast: ['Cillian Murphy', 'Emily Blunt', 'Matt Damon'], director: 'Christopher Nolan',
    producer: 'Emma Thomas, Charles Roven, Christopher Nolan',
    poster: 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
    trailer: 'https://www.youtube.com/embed/uYPbbksJxIg',
  },
  {
    title: 'Alien: Romulus', genre: 'Horror', rating: 'R', runtime: 119, status: 'NOW_PLAYING',
    synopsis: 'A group of young space colonizers come face to face with the most terrifying life form in the universe when they attempt to salvage an abandoned station drifting silently between two worlds.',
    cast: ['Cailee Spaeny', 'David Jonsson', 'Archie Renaux'], director: 'Fede Álvarez',
    producer: 'Ridley Scott, Michael Pruss',
    poster: 'https://image.tmdb.org/t/p/w500/b33nnKl1GSFbao4l3fZDDqsMx0F.jpg',
    trailer: 'https://www.youtube.com/embed/OzY2r2JXsDM',
  },
  {
    title: 'Inside Out 2', genre: 'Animation', rating: 'PG', runtime: 96, status: 'NOW_PLAYING',
    synopsis: 'Riley is now a teenager and new emotions arrive at Headquarters threatening chaos. Anxiety, Envy, Ennui, and Embarrassment crash the party to compete with Joy and the original crew.',
    cast: ['Amy Poehler', 'Maya Hawke', 'Ayo Edebiri'], director: 'Kelsey Mann',
    producer: 'Mark Nielsen',
    poster: 'https://image.tmdb.org/t/p/w500/vpnVM9B6NMmQpWeZvzLvDESb2QY.jpg',
    trailer: 'https://www.youtube.com/embed/LEjhY15eCx0',
  },
  {
    title: 'Kingdom of the Planet of the Apes', genre: 'Action', rating: 'PG_13', runtime: 145, status: 'NOW_PLAYING',
    synopsis: 'Many years after Caesar\'s reign, a young ape questions everything he was taught and makes choices that define a future for apes and humans alike. A new chapter begins.',
    cast: ['Owen Teague', 'Freya Allan', 'Kevin Durand'], director: 'Wes Ball',
    producer: 'Wes Ball, Joe Hartwick Jr., Rick Jaffa, Amanda Silver, Jason Reed',
    poster: 'https://image.tmdb.org/t/p/w500/gKkl37BQuKTanygYQG1pyYgLVgf.jpg',
    trailer: 'https://www.youtube.com/embed/XtFI7SNtVpY',
  },
  {
    title: 'Deadpool & Wolverine', genre: 'Action', rating: 'R', runtime: 128, status: 'NOW_PLAYING',
    synopsis: 'Deadpool is recruited by the TVA and reluctantly teams up with a gruff Wolverine to face a threat that could end their universe — and maybe fix a few things along the way.',
    cast: ['Ryan Reynolds', 'Hugh Jackman', 'Emma Corrin'], director: 'Shawn Levy',
    producer: 'Kevin Feige, Ryan Reynolds, Shawn Levy, Lauren Shuler Donner',
    poster: 'https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg',
    trailer: 'https://www.youtube.com/embed/73_1biulkYk',
  },
  // ── COMING SOON ────────────────────────────────────────────────────────────
  {
    title: 'Venom: The Last Dance', genre: 'Action', rating: 'PG_13', runtime: 109, status: 'COMING_SOON',
    synopsis: 'Eddie Brock and Venom are on the run, hunted by both worlds. Forced into a devastating decision, they must make their last move as the universe closes in around them.',
    cast: ['Tom Hardy', 'Juno Temple', 'Chiwetel Ejiofor'], director: 'Kelly Marcel',
    producer: 'Avi Arad, Matt Tolmach, Amy Pascal, Kelly Marcel, Tom Hardy, Hutch Parker',
    poster: 'https://image.tmdb.org/t/p/w500/aosm8NMQ3UyoBVpSxyimorCQykC.jpg',
    trailer: 'https://www.youtube.com/embed/__2bjWbetsA',
  },
  {
    title: 'Moana 2', genre: 'Animation', rating: 'PG', runtime: 100, status: 'COMING_SOON',
    synopsis: 'Moana sets sail on the far seas of Oceania on an expansive new voyage with an unlikely crew after receiving an unexpected call from her wayfinding ancestors.',
    cast: ['Auli\'i Cravalho', 'Dwayne Johnson', 'Alan Tudyk'], director: 'David Derrick Jr.',
    producer: 'Christina Chen, Yvett Merino',
    poster: 'https://image.tmdb.org/t/p/w500/4YZpsylmjHbqeWzjKpUEF8gcLNW.jpg',
    trailer: 'https://www.youtube.com/embed/hDZ7y8RP5HE',
  },
  {
    title: 'Gladiator II', genre: 'Action', rating: 'R', runtime: 148, status: 'COMING_SOON',
    synopsis: 'Lucius is forced into slavery and becomes a gladiator — battling through the Roman arenas to avenge those he lost and reclaim what was taken from him.',
    cast: ['Paul Mescal', 'Pedro Pascal', 'Denzel Washington'], director: 'Ridley Scott',
    producer: 'Ridley Scott, Lucy Fisher, Douglas Wick, Michael Pruss, David Franzoni',
    poster: 'https://image.tmdb.org/t/p/w500/2cxhvwyEwRlysAmRH4iodkvo0z5.jpg',
    trailer: 'https://www.youtube.com/embed/4rgYUipGJNo',
  },
  {
    title: 'Wicked', genre: 'Musical', rating: 'PG', runtime: 160, status: 'COMING_SOON',
    synopsis: 'Before one became good and the other became wicked, Elphaba and Glinda formed an unlikely friendship at Shiz University that would change the land of Oz forever.',
    cast: ['Cynthia Erivo', 'Ariana Grande', 'Jeff Goldblum'], director: 'Jon M. Chu',
    producer: 'Marc Platt',
    poster: 'https://image.tmdb.org/t/p/w500/xDGbZ0JJ3mYaGKy4Nzd9Kph6M9L.jpg',
    trailer: 'https://www.youtube.com/embed/6COmYeLsz4c',
  },
];
const RUNTIMES = new Map(MOVIES.map(movie => [movie.title, movie.runtime]));

async function insertCatalog(client) {
  await client.query(
    `INSERT INTO theatres (name, online_booking_fee, tax_rate)
     SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM theatres)`,
    [THEATRE.name, THEATRE.bookingFee, THEATRE.taxRate]);
  const { rows: [theatre] } = await client.query('SELECT id FROM theatres');

  for (let n = 1; n <= SHOWROOM_COUNT; n++) {
    await client.query(
      `INSERT INTO showrooms (theatre_id, name, seat_capacity) VALUES ($1, $2, $3)
       ON CONFLICT (theatre_id, name) DO NOTHING`,
      [theatre.id, `Showroom ${n}`, SHOWROOM_ROWS * SEATS_PER_ROW]);
  }
  await client.query(
    `INSERT INTO seats (showroom_id, row_label, seat_number)
     SELECT r.id, chr(64 + row_index), seat_number
     FROM showrooms r, generate_series(1, $1::int) AS row_index, generate_series(1, $2::int) AS seat_number
     ON CONFLICT DO NOTHING`,
    [SHOWROOM_ROWS, SEATS_PER_ROW]);

  for (const type of TICKET_TYPES) {
    await client.query(
      `INSERT INTO ticket_types (name, age_criteria, price) VALUES ($1, $2, $3)
       ON CONFLICT ((lower(name))) DO NOTHING`,
      [type.name, type.ageCriteria, type.price]);
  }

  for (const movie of MOVIES) {
    const { rows: [{ id: movieId }] } = await client.query(
      `INSERT INTO movies (theatre_id, title, cast_members, director, producer, synopsis,
                           poster_image_url, trailer_video_url, rating, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [theatre.id, movie.title, movie.cast, movie.director, movie.producer, movie.synopsis,
        movie.poster, movie.trailer, movie.rating, movie.status]);
    await client.query('INSERT INTO genres (name) VALUES ($1) ON CONFLICT ((lower(name))) DO NOTHING', [movie.genre]);
    await client.query(
      'INSERT INTO movie_genres (movie_id, genre_id) SELECT $1, id FROM genres WHERE lower(name) = lower($2)',
      [movieId, movie.genre]);
  }
}

// Schedules each now-playing movie three times a day in its own showroom, starting today
// in the theatre's time zone. Slots that are already taken are skipped.
async function scheduleShows(client, { days, timezone }) {
  const { rows: rooms } = await client.query('SELECT id FROM showrooms ORDER BY id');
  if (rooms.length === 0) return 0;
  const { rows: movies } = await client.query(
    `SELECT m.id, m.title,
            (SELECT s.duration FROM shows s WHERE s.movie_id = m.id ORDER BY s.starts_at DESC LIMIT 1) AS duration
     FROM movies m WHERE m.status = 'NOW_PLAYING' ORDER BY m.id`);

  let added = 0;
  for (const [index, movie] of movies.entries()) {
    const duration = movie.duration ?? RUNTIMES.get(movie.title) ?? 120;
    const { rowCount } = await client.query(
      `INSERT INTO shows (movie_id, showroom_id, show_date, show_time, duration)
       SELECT $1, $2, (now() AT TIME ZONE $3)::date + day, start_time, $4
       FROM generate_series(0, $5::int - 1) AS day, unnest($6::time[]) AS start_time
       ON CONFLICT DO NOTHING`,
      [movie.id, rooms[index % rooms.length].id, timezone, duration, days, SHOW_TIMES]);
    added += rowCount;
  }
  return added;
}

async function seed(pool, { days = 7, timezone = THEATRE_TIMEZONE } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [SEED_LOCK_ID]);
    const { rows: [{ count }] } = await client.query('SELECT count(*)::int AS count FROM movies');
    if (count === 0) await insertCatalog(client);
    const showsAdded = await scheduleShows(client, { days, timezone });
    await client.query('COMMIT');
    return { catalogSeeded: count === 0, showsAdded };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  const pool = createPool();
  seed(pool)
    .then(({ catalogSeeded, showsAdded }) => {
      console.log(catalogSeeded ? `Seeded ${MOVIES.length} movies.` : 'Catalog already present; left unchanged.');
      console.log(`Scheduled ${showsAdded} new shows.`);
    })
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => pool.end());
}

module.exports = { seed };
