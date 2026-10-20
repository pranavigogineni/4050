const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTestSchema, dropTestSchema } = require('../db/isolated-schema');
const { accountRoutes } = require('../accounts/routes');
const { decrypt, digest, verifyPassword, encrypt, hashPassword } = require('../accounts/security');
const { startMailWorker, enqueue } = require('../accounts/mail');
const schema = `test_accounts_${process.pid}_${Date.now()}`;
const secret = 'MovieNight!2026';
const newSecret = 'NextMovieNight!2027';
let pool, server, base;
const person = (email, extra = {}) => ({
  first_name: 'Test', last_name: 'Moviegoer', email, phone_number: '706-555-0101',
  password: secret, confirm_password: secret, subscribed_to_promotions: false, ...extra,
});
const card = { card_number: '4242424242424242', card_holder_name: 'Test Moviegoer', expiration: '2035-12' };
function client() {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    set cookie(value) { cookie = value; },
    async request(route, method = 'GET', body, headers = {}) {
      const response = await fetch(`${base}${route}`, {
        method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CineMax-Request': '1', ...headers },
        ...(method !== 'GET' ? { body: JSON.stringify(body || {}) } : {}),
      });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      return { status: response.status, body: await response.json(), headers: response.headers };
    },
  };
}
async function emailToken(address, purpose = 'VERIFY_EMAIL') {
  const { rows } = await pool.query('SELECT encrypted_payload FROM email_outbox WHERE encrypted_payload IS NOT NULL ORDER BY id DESC');
  const mail = rows.map(row => JSON.parse(decrypt(row.encrypted_payload, 'email')))
    .find(message => message.to === address && message.subject === (purpose === 'VERIFY_EMAIL' ? 'Verify your CineMax email' : 'Reset your CineMax password'));
  assert.ok(mail, 'A transactional email is queued');
  return mail.text.match(/#token=([a-f0-9]{64})/)[1];
}
async function register(address, extra) {
  const api = client();
  const result = await api.request('/auth/register', 'POST', person(address, extra));
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return api;
}
async function active(address) {
  const api = await register(address);
  assert.equal((await api.request('/auth/verify-email', 'POST', { token: await emailToken(address) })).status, 200);
  assert.equal((await api.request('/auth/login', 'POST', { email: address, password: secret })).status, 200);
  return api;
}
before(async () => {
  process.env.DATA_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  process.env.APP_URL = 'http://localhost:5001';
  pool = await createTestSchema(schema);
  const app = express();
  app.use(express.json());
  app.use(accountRoutes(pool));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (pool) { await dropTestSchema(pool, schema); await pool.end(); }
});
// Reset limits between scenarios; individual scenarios explicitly test throttling.
const clearLimits = () => pool.query('DELETE FROM auth_rate_limits');

test('registration validates fields, keeps inactive accounts out, encrypts cards and verifies one time', async () => {
  await clearLimits();
  const api = client();
  for (const overrides of [
    { email: 'invalid' }, { first_name: '' }, { phone_number: '123' },
    { password: 'weak' }, { confirm_password: 'different' },
    { street: '1 Main St' }, { card: { ...card, card_number: '12345' } },
  ]) assert.equal((await api.request('/auth/register', 'POST', person('invalid@example.com', overrides))).status, 400);
  await clearLimits();
  const email = 'verify@example.com';
  const registered = await register(email, { role: 'admin', status: 'ACTIVE', card });
  const { rows: [user] } = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
  assert.equal(user.role, 'customer');
  assert.equal(user.status, 'INACTIVE');
  assert.notEqual(user.password_hash, secret);
  assert.ok(await verifyPassword(secret, user.password_hash));
  const { rows: [stored] } = await pool.query('SELECT * FROM payment_cards WHERE customer_id=$1', [user.id]);
  assert.ok(!stored.encrypted_card_number.includes(card.card_number));
  assert.equal(decrypt(stored.encrypted_card_number, `card:${user.id}`), card.card_number);
  assert.equal((await registered.request('/auth/login', 'POST', { email, password: secret })).status, 403);
  assert.equal((await registered.request('/auth/register', 'POST', person(email.toUpperCase()))).status, 409);
  const raw = await emailToken(email);
  assert.equal((await pool.query('SELECT token_hash FROM auth_tokens WHERE user_id=$1', [user.id])).rows[0].token_hash, digest(raw));
  assert.equal((await registered.request('/auth/verify-email', 'POST', { token: raw })).status, 200);
  assert.equal((await registered.request('/auth/verify-email', 'POST', { token: raw })).status, 400);
  const login = await registered.request('/auth/login', 'POST', { email: email.toUpperCase(), password: secret });
  assert.equal(login.status, 200);
  assert.ok(!('password_hash' in login.body.user));
  assert.match(login.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(login.headers.get('set-cookie'), /SameSite=Lax/i);
  assert.equal((await registered.request('/account')).body.user.status, 'ACTIVE');
});

test('session access, role checks, ownership, immutable email and profile notifications', async () => {
  await clearLimits();
  const guest = client();
  assert.equal((await guest.request('/account')).status, 401);
  const alice = await active('alice@example.com');
  const bob = await active('bob@example.com');
  assert.equal((await alice.request('/admin')).status, 403);
  const profile = {
    first_name: 'Alice', last_name: 'Updated', phone_number: '+1 (706) 555-0199', subscribed_to_promotions: true,
    street: '10 Main St', city: 'Athens', state: 'GA', zip_code: '30602',
  };
  assert.equal((await alice.request('/account', 'PUT', { ...profile, email: 'changed@example.com' })).status, 400);
  const saved = await alice.request('/account', 'PUT', profile);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.user.email, 'alice@example.com');
  assert.equal(saved.body.user.street, profile.street);
  assert.equal((await alice.request('/account')).body.user.subscribed_to_promotions, true);
  const mails = (await pool.query('SELECT encrypted_payload FROM email_outbox')).rows.map(r => JSON.parse(decrypt(r.encrypted_payload, 'email')));
  assert.ok(mails.some(mail => mail.to === 'alice@example.com' && /personal profile/.test(mail.text)));
  assert.equal((await alice.request('/account/cards', 'POST', card)).status, 201);
  const stored = (await alice.request('/account/cards')).body[0];
  assert.equal(stored.last_four, '4242');
  assert.ok(!JSON.stringify(stored).includes(card.card_number));
  assert.ok(!('encrypted_card_number' in stored));
  assert.equal((await bob.request(`/account/cards/${stored.id}`, 'PUT', card)).status, 404);
  assert.equal((await bob.request(`/account/cards/${stored.id}`, 'DELETE')).status, 404);
  assert.equal((await alice.request(`/account/cards/${stored.id}`, 'PUT', { ...card, card_holder_name: 'Alice Updated' })).status, 200);
  const additions = await Promise.all([1, 2, 3, 4].map(() => alice.request('/account/cards', 'POST', card)));
  assert.equal(additions.filter(r => r.status === 201).length, 2);
  assert.equal(additions.filter(r => r.status === 400).length, 2);
  assert.equal((await alice.request('/account/cards')).body.length, 3);
  assert.equal((await alice.request(`/account/cards/${stored.id}`, 'DELETE')).status, 200);
  assert.equal((await alice.request('/account/cards', 'POST', { ...card, expiration: '2001-01' })).status, 400);
  const oldCookie = alice.cookie;
  assert.equal((await alice.request('/auth/logout', 'POST')).status, 200);
  alice.cookie = oldCookie;
  assert.equal((await alice.request('/account')).status, 401);
  const bobUser = (await bob.request('/account')).body.user;
  await pool.query("UPDATE users SET role='admin' WHERE id=$1", [bobUser.id]);
  assert.deepEqual((await bob.request('/admin')).body.sections, ['Manage Movies', 'Promotions', 'Users', 'Showtimes']);
  await pool.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [bobUser.id]);
  assert.equal((await bob.request('/admin')).status, 401);
  assert.equal((await bob.request('/auth/login', 'POST', { email: 'bob@example.com', password: secret })).status, 403);
});

test('favorites are persistent, idempotent and scoped to their owner', async () => {
  await clearLimits();
  const alice = await active('favorites@example.com');
  const bob = await active('otherfavorites@example.com');
  for (let i = 0; i < 2; i++) assert.equal((await alice.request('/account/favorites/1', 'PUT')).status, 200);
  assert.equal((await alice.request('/account/favorites')).body.length, 1);
  assert.equal((await bob.request('/account/favorites')).body.length, 0);
  assert.equal((await alice.request('/account/favorites/99999', 'PUT')).status, 404);
  assert.equal((await alice.request('/account/favorites/nope', 'PUT')).status, 404);
  assert.equal((await alice.request('/account/favorites/1', 'DELETE')).status, 200);
  assert.equal((await alice.request('/account/favorites')).body.length, 0);
});

test('password changes require the current password; recovery tokens expire, are single-use and revoke sessions', async () => {
  await clearLimits();
  const email = 'password@example.com';
  const api = await active(email);
  const other = client();
  await other.request('/auth/login', 'POST', { email, password: secret });
  assert.equal((await api.request('/account/password', 'POST', { current_password: 'wrong', password: newSecret, confirm_password: newSecret })).status, 403);
  const nonexistent = await api.request('/auth/forgot-password', 'POST', { email: 'nobody@example.com' });
  const existing = await api.request('/auth/forgot-password', 'POST', { email });
  assert.deepEqual(existing.body, nonexistent.body);
  const oldReset = await emailToken(email, 'RESET_PASSWORD');
  await pool.query('UPDATE auth_tokens SET expires_at=now()-interval \'1 second\' WHERE token_hash=$1', [digest(oldReset)]);
  assert.equal((await api.request('/auth/reset-password', 'POST', { token: oldReset, password: newSecret, confirm_password: newSecret })).status, 400);
  await api.request('/auth/forgot-password', 'POST', { email });
  const reset = await emailToken(email, 'RESET_PASSWORD');
  const changed = await api.request('/auth/reset-password', 'POST', { token: reset, password: newSecret, confirm_password: newSecret });
  assert.equal(changed.status, 200);
  assert.equal((await other.request('/account')).status, 401);
  assert.equal((await api.request('/auth/reset-password', 'POST', { token: reset, password: newSecret, confirm_password: newSecret })).status, 400);
  assert.equal((await api.request('/auth/login', 'POST', { email, password: secret })).status, 401);
  assert.equal((await api.request('/auth/login', 'POST', { email, password: newSecret })).status, 200);
  assert.equal((await api.request('/account/password', 'POST', { current_password: newSecret, password: secret, confirm_password: secret })).status, 200);
  assert.equal((await api.request('/account')).status, 401);
  assert.equal((await api.request('/auth/login', 'POST', { email, password: secret })).status, 200);
  const rawSession = api.cookie.split('=')[1];
  await pool.query("UPDATE user_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [digest(rawSession)]);
  assert.equal((await api.request('/account')).status, 401);
});

test('verification resends revoke previous tokens; writes reject cross-origin requests and enforce throttling', async () => {
  await clearLimits();
  const email = 'resend@example.com';
  const api = await register(email);
  const old = await emailToken(email);
  assert.equal((await api.request('/auth/resend-verification', 'POST', { email })).status, 200);
  const latest = await emailToken(email);
  assert.notEqual(old, latest);
  assert.equal((await api.request('/auth/verify-email', 'POST', { token: old })).status, 400);
  assert.equal((await api.request('/auth/verify-email', 'POST', { token: latest })).status, 200);
  assert.equal((await api.request('/auth/logout', 'POST', {}, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await api.request('/auth/logout', 'POST', {}, { 'X-CineMax-Request': '' })).status, 403);
  await pool.query("INSERT INTO auth_rate_limits (key_hash, attempts, expires_at) VALUES ($1,20,now()+interval '15 minutes')", [digest(`login:email:${email}`)]);
  assert.equal((await api.request('/auth/login', 'POST', { email, password: secret })).status, 429);
});

test('expired verification, wrong-purpose tokens and concurrent resets cannot bypass account security', async () => {
  await clearLimits();
  const email = 'edgecases@example.com';
  const api = await register(email);
  const expired = await emailToken(email);
  await pool.query("UPDATE auth_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [digest(expired)]);
  assert.equal((await api.request('/auth/verify-email', 'POST', { token: expired })).status, 400);
  assert.equal((await pool.query('SELECT status FROM users WHERE email=$1', [email])).rows[0].status, 'INACTIVE');
  await api.request('/auth/resend-verification', 'POST', { email });
  const verify = await emailToken(email);
  assert.equal((await api.request('/auth/reset-password', 'POST', { token: verify, password: newSecret, confirm_password: newSecret })).status, 400);
  assert.equal((await api.request('/auth/verify-email', 'POST', { token: verify })).status, 200);
  for (const body of [{}, { email, password: null }, { email, password: ['bad'] }, { email: "' OR 1=1--", password: secret }, { email: 'missing@example.com', password: secret }]) {
    assert.ok([400, 401].includes((await api.request('/auth/login', 'POST', body)).status));
  }
  await api.request('/auth/login', 'POST', { email, password: secret });
  assert.equal((await api.request('/account/password', 'POST', { password: newSecret, confirm_password: newSecret })).status, 403);
  assert.equal((await api.request('/account')).status, 200);
  await api.request('/auth/forgot-password', 'POST', { email });
  const reset = await emailToken(email, 'RESET_PASSWORD');
  assert.equal((await api.request('/auth/verify-email', 'POST', { token: reset })).status, 400);
  assert.equal((await api.request('/auth/reset-password', 'POST', { token: reset, password: newSecret, confirm_password: secret })).status, 400);
  const resets = await Promise.all([client(), client()].map(c =>
    c.request('/auth/reset-password', 'POST', { token: reset, password: newSecret, confirm_password: newSecret })));
  assert.deepEqual(resets.map(r => r.status).sort(), [200, 400]);
  assert.equal((await api.request('/account')).status, 401);
  await api.request('/auth/login', 'POST', { email, password: newSecret });
  await api.request('/auth/forgot-password', 'POST', { email });
  const pending = await emailToken(email, 'RESET_PASSWORD');
  assert.equal((await api.request('/account/password', 'POST', { current_password: newSecret, password: secret, confirm_password: secret })).status, 200);
  assert.equal((await api.request('/auth/reset-password', 'POST', { token: pending, password: newSecret, confirm_password: newSecret })).status, 400);
});

test('profile integrity, one home address, card validation and all private routes reject invalid access', async () => {
  await clearLimits();
  const guest = client();
  for (const [route, method, body] of [
    ['/account','PUT',{}], ['/account/password','POST',{}], ['/account/cards','GET'],
    ['/account/cards','POST',card], ['/account/cards/1','PUT',card], ['/account/cards/1','DELETE'],
    ['/account/favorites','GET'], ['/account/favorites/1','PUT'], ['/account/favorites/1','DELETE'], ['/admin','GET'],
  ]) assert.equal((await guest.request(route, method, body)).status, 401, `${method} ${route}`);
  const api = await active('integrity@example.com');
  const profile = { first_name: 'Test', last_name: 'User', phone_number: '7065550100', subscribed_to_promotions: false };
  for (const extra of [{ role: 'admin' }, { status: 'ACTIVE' }, { id: 999 }, { first_name: '' }, { subscribed_to_promotions: 'true' },
    { street: '10 Main' }, { street: '10 Main', city: 'Athens', state: 'GA', zip_code: 'bad' }]) {
    assert.equal((await api.request('/account','PUT',{ ...profile, ...extra })).status, 400);
  }
  for (const street of ['10 Main Street','20 Oak Street']) {
    assert.equal((await api.request('/account','PUT',{ ...profile, street, city: 'Athens', state: 'GA', zip_code: '30602' })).status, 200);
  }
  assert.equal((await api.request('/account')).body.user.street, '20 Oak Street');
  assert.equal((await api.request('/account','PUT',profile)).status, 200);
  assert.equal((await api.request('/account')).body.user.street, null);
  for (const extra of [{ card_number:'4242424242424241' }, { card_number:'0000000000000000' },
    { card_number:{number:'4242424242424242'} }, { expiration:'2035-13' }, { card_holder_name:'' },
    { billing_street:'Partial address' }, { billing_street:'1 Main',billing_city:'Athens',billing_state:'GA',billing_zip_code:'bad' }]) {
    assert.equal((await api.request('/account/cards','POST',{ ...card, ...extra })).status, 400);
  }
  assert.equal((await api.request('/account/cards')).body.length, 0);
  const userId = (await api.request('/account')).body.user.id;
  await pool.query("UPDATE users SET role='admin' WHERE id=$1", [userId]);
  assert.equal((await api.request('/account/favorites','GET')).status, 403);
  assert.equal((await api.request('/account/cards','POST',card)).status, 403);
});

test('password salts and authenticated card encryption resist reuse, tampering and cross-account substitution', async () => {
  const [one,two] = await Promise.all([hashPassword(secret),hashPassword(secret)]);
  assert.notEqual(one,two);
  assert.ok(await verifyPassword(secret,one));
  assert.equal(await verifyPassword('incorrect',one),false);
  const encrypted = encrypt(card.card_number,'card:1');
  assert.notEqual(encrypted,encrypt(card.card_number,'card:1'));
  assert.throws(() => decrypt(encrypted,'card:2'));
  const parts = encrypted.split(':');
  parts[2] = (parts[2][0] === 'a' ? 'b' : 'a') + parts[2].slice(1);
  assert.throws(() => decrypt(parts.join(':'),'card:1'));
});

test('SMTP worker keeps failed mail encrypted, retries it, and acknowledges only an accepted delivery', async t => {
  // Exercise the SMTP branch with a fake provider; never contact real recipients.
  const nodemailer = require('nodemailer');
  const old = Object.fromEntries(['MAIL_MODE','SMTP_HOST','SMTP_FROM','NODE_ENV'].map(key => [key,process.env[key]]));
  t.after(() => { for (const [key,value] of Object.entries(old)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
  process.env.MAIL_MODE = 'smtp';
  process.env.SMTP_HOST = 'smtp.test.invalid';
  process.env.SMTP_FROM = 'CineMax <no-reply@example.com>';
  process.env.NODE_ENV = 'test';
  let attempts = 0;
  let delivered;
  t.mock.method(nodemailer,'createTransport', options => {
    assert.equal(options.requireTLS,true);
    return {
      async sendMail(message) {
        attempts++;
        if (attempts === 1) throw new Error('Simulated temporary provider outage');
        delivered = message;
        return { accepted: [message.to] };
      },
      close() {},
    };
  });
  await pool.query("UPDATE email_outbox SET next_attempt_at=now()+interval '1 day' WHERE sent_at IS NULL");
  await enqueue(pool,'delivery@example.com','Audit delivery','A test notification.');
  const id = (await pool.query('SELECT max(id) AS id FROM email_outbox')).rows[0].id;
  const stop = startMailWorker(pool);
  t.after(stop);
  async function waitFor(check) {
    for (let i=0;i<60;i++) {
      const row = (await pool.query('SELECT * FROM email_outbox WHERE id=$1',[id])).rows[0];
      if (check(row)) return row;
      await new Promise(resolve => setTimeout(resolve,100));
    }
    assert.fail('Mail worker did not reach the expected state');
  }
  const failed = await waitFor(row => row.attempts === 1);
  assert.equal(failed.sent_at,null);
  assert.ok(failed.encrypted_payload.startsWith('v1:'));
  assert.ok(new Date(failed.next_attempt_at) > new Date());
  await pool.query('UPDATE email_outbox SET next_attempt_at=now() WHERE id=$1',[id]);
  const sent = await waitFor(row => row.sent_at);
  assert.equal(sent.encrypted_payload,null);
  assert.equal(delivered.to,'delivery@example.com');
  assert.equal(delivered.from,process.env.SMTP_FROM);
  assert.equal(delivered.text,'A test notification.');
  assert.equal(attempts,2);
});

test('email worker delivers queued messages in explicit test file mode and erases sent payloads', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cinemax-mail-'));
  process.env.MAIL_MODE = 'file';
  process.env.MAIL_OUTPUT_DIR = dir;
  process.env.NODE_ENV = 'test';
  await pool.query('UPDATE email_outbox SET next_attempt_at=now() WHERE sent_at IS NULL');
  const first = (await pool.query('SELECT id FROM email_outbox WHERE sent_at IS NULL ORDER BY id LIMIT 1')).rows[0];
  const stop = startMailWorker(pool);
  try {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if ((await fs.readdir(dir)).length) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const mail = JSON.parse(await fs.readFile(path.join(dir, `${first.id}.json`), 'utf8'));
    assert.match(mail.to, /@example.com$/);
    assert.ok(mail.subject);
    // The write and queue acknowledgement are two separate asynchronous actions.
    for (let i = 0; i < 20; i++) {
      const stored = (await pool.query('SELECT sent_at, encrypted_payload FROM email_outbox WHERE id=$1', [first.id])).rows[0];
      if (stored.sent_at) { assert.equal(stored.encrypted_payload, null); return; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.fail('Email was not acknowledged');
  } finally { stop(); await fs.rm(dir, { recursive: true, force: true }); }
});
