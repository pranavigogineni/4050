// Applies the SQL files in db/migrations with node-pg-migrate.
//   npm run migrate              apply every pending migration
//   npm run migrate -- down      undo the most recent migration
const path = require('path');
const { createClient } = require('./connection');

async function migrate({ direction = 'up', databaseUrl, schema = process.env.DB_SCHEMA, log = console.log } = {}) {
  const { runner } = await import('node-pg-migrate'); // ESM-only package
  const client = createClient(databaseUrl);
  await client.connect();
  try {
    return await runner({
      dbClient: client,
      dir: path.join(__dirname, 'migrations'),
      direction,
      migrationsTable: 'schema_migrations',
      schema,
      createSchema: Boolean(schema),
      advisoryLockMode: 'wait',
      log,
    });
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  migrate({ direction: process.argv[2] === 'down' ? 'down' : 'up' })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { migrate };
