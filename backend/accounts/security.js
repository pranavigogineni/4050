const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

const token = () => crypto.randomBytes(32).toString('hex');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
function password(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128 ||
      !/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value) || !/[^a-zA-Z0-9]/.test(value)) {
    fail('Use 12–128 characters, including uppercase, lowercase, a number, and a symbol.');
  }
  return value;
}
async function hashPassword(value) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(value, salt, 64, SCRYPT_OPTIONS);
  return `scrypt$${salt}$${key.toString('hex')}`;
}
async function verifyPassword(value, stored) {
  if (typeof value !== 'string' || value.length > 128) return false;
  const [scheme, salt, hash] = (stored || '').split('$');
  // Do the same expensive work for missing accounts and obsolete hashes.
  const actual = await scrypt(value, salt || 'invalid-account-salt', 64, SCRYPT_OPTIONS);
  const expected = Buffer.from(hash || '', 'hex');
  return scheme === 'scrypt' && expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
function encryptionKey() {
  const value = process.env.DATA_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) fail('Account storage is not configured. Set DATA_ENCRYPTION_KEY on the server.', 503);
  return Buffer.from(value, 'hex');
}
function encrypt(value, context) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
}
function decrypt(value, context) {
  const [version, iv, tag, data] = value.split(':');
  if (version !== 'v1') throw new Error('Unsupported encrypted payload');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'hex'));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8');
}
module.exports = { token, digest, fail, password, hashPassword, verifyPassword, encrypt, decrypt };
