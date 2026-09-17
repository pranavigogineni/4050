const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdtemp, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

async function start(databasePath, cwd) {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    cwd,
    env: { ...process.env, PORT: '0', SQLITE_DB_PATH: databasePath, DATABASE_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${output}`));
    }, 10000);
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

test('SQLite seeds a fresh database, serves the API, and preserves edits on restart', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ces-sqlite-'));
  const databasePath = path.join(directory, 'test.db');
  let server;
  t.after(async () => {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  });
  // Start outside backend/ to verify database and configuration paths are stable.
  server = await start(databasePath, directory);
  const movies = await server.get('/movies');
  assert.equal(movies.status, 200);
  assert.equal(movies.body.length, 10);
  assert.deepEqual([...new Set(movies.body.map(m => m.status))].sort(), ['coming_soon', 'running']);
  assert.ok(new Set(movies.body.map(m => m.genre)).size > 1);
  assert.equal(movies.body[0].title, 'Dune: Part Two');

  for (const movie of movies.body) {
    assert.deepEqual(movie.showtimes, ['2:00 PM', '5:00 PM', '8:00 PM']);
    const detail = await server.get(`/movies/${movie.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.title, movie.title);
    assert.deepEqual(detail.body.showtimes, ['2:00 PM', '5:00 PM', '8:00 PM']);
  }

  assert.equal((await server.get('/movies?search=uNe')).body.length, 1);
  const actions = (await server.get('/movies?genre=aCtIoN')).body;
  assert.ok(actions.length > 0);
  assert.ok(actions.every(movie => movie.genre === 'Action'));
  assert.equal((await server.get('/movies?search=DUNE&genre=sci-fi')).body.length, 1);
  assert.deepEqual((await server.get('/movies?search=DUNE&genre=action')).body, []);
  assert.deepEqual((await server.get('/movies?search=nonexistent-title')).body, []);
  assert.deepEqual((await server.get('/movies?genre=nonexistent-genre')).body, []);
  assert.deepEqual((await server.get('/movies?search=%27%20OR%201%3D1--')).body, []);
  const genres = await server.get('/genres');
  assert.equal(genres.status, 200);
  assert.deepEqual(genres.body, [...new Set(movies.body.map(m => m.genre))].sort());
  assert.equal((await server.get('/movies/99999')).status, 404);

  await server.stop();
  const db = new Database(databasePath);
  try {
    db.prepare('UPDATE movies SET title = ? WHERE id = ?').run('Dune: Part Three', movies.body[0].id);
    db.prepare('UPDATE movies SET trailer_url = ? WHERE id = ?')
      .run('https://www.youtube.com/embed/8zU5TWJHHOU', movies.body[2].id);
    db.prepare('UPDATE movies SET title = ? WHERE id = ?').run('Local edited title', movies.body[1].id);
  } finally { db.close(); }
  server = await start(databasePath, directory);
  assert.equal((await server.get('/movies')).body.length, 10);
  const persisted = (await server.get(`/movies/${movies.body[0].id}`)).body;
  assert.equal(persisted.title, 'Dune: Part Two');
  assert.equal(persisted.showtimes.length, 3);
  assert.equal((await server.get(`/movies/${movies.body[1].id}`)).body.title, 'Local edited title');
  assert.equal(
    (await server.get(`/movies/${movies.body[2].id}`)).body.trailer_url,
    'https://www.youtube.com/embed/OzY2r2JXsDM'
  );
});
