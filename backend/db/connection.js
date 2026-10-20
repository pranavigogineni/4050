// Shared PostgreSQL (Supabase) connection settings for the server, migrations, seed and tests.
const path = require('path');
const fs = require('node:fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client, Pool } = require('pg');

// Show dates and times are Eastern Time (EST/EDT).
const THEATRE_TIMEZONE = 'America/New_York';

function connectionConfig(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Copy backend/.env.example to backend/.env and add the Supabase connection string.');
  }
  // SSL is configured below; pg would let URL parameters override it.
  const url = new URL(databaseUrl);
  for (const key of ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey']) url.searchParams.delete(key);
  const config = { connectionString: url.toString() };

  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return config;
  // Use the project's root certificate downloaded from Supabase Database settings.
  // Relative paths are resolved against backend/, independent of the working directory.
  const caFile = process.env.DB_SSL_CA_FILE;
  config.ssl = {
    rejectUnauthorized: Boolean(caFile) || process.env.NODE_ENV === 'production',
    ...(caFile ? { ca: fs.readFileSync(path.resolve(__dirname, '..', caFile), 'utf8') } : {}),
  };
  return config;
}

// `schema` (or DB_SCHEMA) points every pooled connection at one schema; tests use throwaway schemas.
function createPool({ databaseUrl, schema = process.env.DB_SCHEMA } = {}) {
  const pool = new Pool({
    ...connectionConfig(databaseUrl),
    max: 5,
    // Runs before the pool hands out a new connection.
    onConnect: schema && (client => client.query(`SET search_path TO ${client.escapeIdentifier(schema)}`)),
  });
  pool.on('error', error => console.error(`Idle database connection error: ${error.message}`));
  return pool;
}

function createClient(databaseUrl) {
  return new Client(connectionConfig(databaseUrl));
}

module.exports = { createPool, createClient, connectionConfig, THEATRE_TIMEZONE };
