// Throwaway schemas for automated tests, so they never touch the demo data in `public`.
// Tests use TEST_DATABASE_URL when it is set, otherwise DATABASE_URL.
//   node db/isolated-schema.js reset test_browser    drop, migrate and seed one schema
//   node db/isolated-schema.js serve test_browser    reset it, then run the server on it
const { createPool } = require('./connection');
const { migrate } = require('./migrate');
const { seed } = require('./seed');

const testDatabaseUrl = () => process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

function checkName(schema) {
  if (!/^test_[a-z0-9_]+$/.test(schema)) throw new Error(`Test schema names must look like test_name: ${schema}`);
}

async function dropTestSchema(pool, schema) {
  checkName(schema);
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
}

// Returns a pool whose connections use the freshly migrated and seeded schema.
async function createTestSchema(schema, databaseUrl = testDatabaseUrl()) {
  checkName(schema);
  const pool = createPool({ databaseUrl, schema });
  try {
    await dropTestSchema(pool, schema);
    await migrate({ databaseUrl, schema, log: () => {} });
    await seed(pool);
  } catch (error) {
    await dropTestSchema(pool, schema).catch(() => {});
    await pool.end();
    throw error;
  }
  return pool;
}

if (require.main === module) {
  const [command, schema] = process.argv.slice(2);
  if (!['reset', 'serve'].includes(command) || !schema) {
    console.error('Usage: node db/isolated-schema.js reset|serve test_<name>');
    process.exit(1);
  }
  createTestSchema(schema)
    .then(pool => pool.end())
    .then(() => {
      console.log(`Reset schema ${schema}.`);
      if (command === 'serve') {
        process.env.DATABASE_URL = testDatabaseUrl();
        process.env.DB_SCHEMA = schema;
        require('../server');
      }
    })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { createTestSchema, dropTestSchema, testDatabaseUrl };
