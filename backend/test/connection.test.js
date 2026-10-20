const { test } = require('node:test');
const assert = require('node:assert/strict');
const { connectionConfig } = require('../db/connection');
test('remote database TLS verifies certificates in production and never accepts a URL override', () => {
  const oldEnv = process.env.NODE_ENV;
  const oldCA = process.env.DB_SSL_CA_FILE;
  try {
    delete process.env.DB_SSL_CA_FILE;
    process.env.NODE_ENV = 'production';
    const config = connectionConfig('postgresql://test:example@database.example/test?sslmode=no-verify');
    assert.equal(config.ssl.rejectUnauthorized, true);
    assert.equal(new URL(config.connectionString).searchParams.has('sslmode'), false);
    assert.equal(connectionConfig('postgresql://test:example@localhost/test').ssl, undefined);
    process.env.DB_SSL_CA_FILE = 'definitely-missing-audit-certificate.pem';
    assert.throws(() => connectionConfig('postgresql://test:example@database.example/test'), { code: 'ENOENT' });
  } finally {
    if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
    if (oldCA === undefined) delete process.env.DB_SSL_CA_FILE; else process.env.DB_SSL_CA_FILE = oldCA;
  }
});
