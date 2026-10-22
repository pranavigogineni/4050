const express = require('express');
const { token, digest, fail, password, hashPassword, verifyPassword, encrypt } = require('./security');
const validate = require('./validation');
const { enqueue, publicOrigin } = require('./mail');

const PUBLIC_FIELDS = 'id, role, first_name, last_name, email, phone_number, status, subscribed_to_promotions, street, city, state, zip_code';
const COOKIE = 'cinemax_session';
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const genericRecovery = 'If an eligible account exists, an email will arrive shortly. Check your spam folder too.';
function sessionToken(req) {
  const value = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}
async function transaction(pool, work) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await work(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
}

function accountRoutes(pool) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      // A custom header forces cross-origin requests through CORS preflight.
      // This also covers login/logout CSRF before a session exists.
      if (req.get('X-CineMax-Request') !== '1') return res.status(403).json({ error: 'Refresh this page and try again.' });
      const origin = req.get('Origin');
      const allowed = [publicOrigin(), ...(process.env.NODE_ENV !== 'production'
        ? ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://127.0.0.1:5017'] : [])];
      if (origin && !allowed.includes(origin)) return res.status(403).json({ error: 'Request origin is not allowed.' });
      if (!req.is('application/json')) return res.status(415).json({ error: 'Send form data as JSON.' });
    }
    next();
  });

  const rateLimit = (group, limit = 12) => wrap(async (req, res, next) => {
    const keys = [`${group}:ip:${req.ip}`];
    if (typeof req.body?.email === 'string') keys.push(`${group}:email:${req.body.email.trim().toLowerCase()}`);
    for (const key of keys) {
      const { rows: [row] } = await pool.query(
        `INSERT INTO auth_rate_limits (key_hash, attempts, expires_at) VALUES ($1, 1, now() + interval '15 minutes')
         ON CONFLICT (key_hash) DO UPDATE SET
         attempts = CASE WHEN auth_rate_limits.expires_at <= now() THEN 1 ELSE auth_rate_limits.attempts + 1 END,
         expires_at = CASE WHEN auth_rate_limits.expires_at <= now() THEN now() + interval '15 minutes' ELSE auth_rate_limits.expires_at END
         RETURNING attempts`, [digest(key)]);
      if (row.attempts > limit) {
        res.set('Retry-After', '900');
        fail('Too many attempts. Please try again in 15 minutes.', 429);
      }
    }
    next();
  });
  const requireUser = wrap(async (req, res, next) => {
    const raw = sessionToken(req);
    if (!raw) fail('Please log in to continue.', 401);
    const { rows: [user] } = await pool.query(
      `SELECT u.* FROM users u JOIN user_sessions s ON s.user_id = u.id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'ACTIVE'`, [digest(raw)]);
    if (!user) {
      res.clearCookie(COOKIE, cookieOptions());
      fail('Your session has ended. Please log in again.', 401);
    }
    req.user = user;
    req.sessionHash = digest(raw);
    next();
  });
  const customer = (req, res, next) => req.user.role === 'customer' ? next() : res.status(403).json({ error: 'This feature is for customer accounts.' });
  const publicUser = async (db, userId) => (await db.query(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = $1`, [userId])).rows[0];
  const notification = (db, user, detail) => enqueue(db, user.email, 'Your CineMax account was updated',
    `Hello ${user.first_name},\n\n${detail}\n\nIf you did not make this change, reset your password immediately at ${publicOrigin()}/forgot-password.\n\nCineMax`);
  async function issueToken(db, user, purpose) {
    const raw = token();
    await db.query('UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL', [user.id, purpose]);
    await db.query(`INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
      VALUES ($1, $2, $3, now() + $4::interval)`,
      [user.id, purpose, digest(raw), purpose === 'VERIFY_EMAIL' ? '24 hours' : '30 minutes']);
    const verification = purpose === 'VERIFY_EMAIL';
    const url = `${publicOrigin()}/${verification ? 'verify-email' : 'reset-password'}#token=${raw}`;
    await enqueue(db, user.email, verification ? 'Verify your CineMax email' : 'Reset your CineMax password',
      `Hello ${user.first_name},\n\n${verification ? 'Confirm your email to activate your account' : 'Choose a new password'}:\n${url}\n\nThis link expires in ${verification ? '24 hours' : '30 minutes'} and can be used once. If you did not request this, you can ignore this email.\n\nCineMax`);
  }
  async function insertCard(db, userId, data) {
    // Lock the parent before counting/inserting, including concurrent requests.
    await db.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const { rows: [count] } = await db.query('SELECT count(*)::int AS n FROM payment_cards WHERE customer_id = $1', [userId]);
    if (count.n >= 3) fail('You can save up to three payment cards. Remove a card before adding another.');
    return (await db.query(
      `INSERT INTO payment_cards (customer_id, encrypted_card_number, card_holder_name, expiration_date, last_four,
       billing_street, billing_city, billing_state, billing_zip_code) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [userId, encrypt(data.number, `card:${userId}`), data.holder, data.expiration, data.number.slice(-4), ...data.billing])).rows[0];
  }
  router.post('/auth/register', rateLimit('register', 10), wrap(async (req, res) => {
    const data = validate.profile(req.body);
    const email = validate.email(req.body.email);
    const secret = password(req.body.password);
    if (secret !== req.body.confirm_password) fail('Passwords do not match.');
    const payment = req.body.card ? validate.card(req.body.card) : null;
    const hash = await hashPassword(secret);
    try {
      await transaction(pool, async db => {
        const { rows: [user] } = await db.query(
          `INSERT INTO users (role, first_name, last_name, phone_number, subscribed_to_promotions, street, city, state, zip_code, email, password_hash)
           VALUES ('customer',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, first_name, email`, [...data, email, hash]);
        if (payment) await insertCard(db, user.id, payment);
        await issueToken(db, user, 'VERIFY_EMAIL');
      });
    } catch (error) {
      if (error.code === '23505') fail('An account already uses this email. Log in or request a password reset.', 409);
      throw error;
    }
    res.status(201).json({ message: 'Your account is created. Check your email and verify your address before logging in.' });
  }));
  router.post('/auth/verify-email', rateLimit('verify', 30), wrap(async (req, res) => {
    const raw = req.body?.token;
    if (typeof raw !== 'string' || !/^[a-f0-9]{64}$/.test(raw)) fail('This verification link is invalid or expired. Request a new one.');
    await transaction(pool, async db => {
      // All token operations lock the user first, then tokens, avoiding races
      // between resends, reset and password changes.
      const { rows: [user] } = await db.query(
        `SELECT u.* FROM users u JOIN auth_tokens t ON t.user_id = u.id
         WHERE t.token_hash = $1 AND t.purpose = 'VERIFY_EMAIL' FOR UPDATE OF u`, [digest(raw)]);
      if (!user || user.status !== 'INACTIVE') fail('This verification link is invalid or already used.');
      const used = await db.query(`UPDATE auth_tokens SET used_at = now() WHERE token_hash = $1 AND purpose = 'VERIFY_EMAIL'
        AND used_at IS NULL AND expires_at > now() RETURNING id`, [digest(raw)]);
      if (!used.rowCount) fail('This verification link is invalid or expired. Request a new one.');
      await db.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [user.id]);
    });
    res.json({ message: 'Your email is verified. You can now log in.' });
  }));
  for (const [endpoint, purpose] of [['resend-verification', 'VERIFY_EMAIL'], ['forgot-password', 'RESET_PASSWORD']]) {
    router.post(`/auth/${endpoint}`, rateLimit('recovery', 8), wrap(async (req, res) => {
      const email = validate.email(req.body?.email);
      await transaction(pool, async db => {
        const { rows: [user] } = await db.query('SELECT * FROM users WHERE lower(email) = $1 FOR UPDATE', [email]);
        const eligible = purpose === 'VERIFY_EMAIL' ? 'INACTIVE' : 'ACTIVE';
        if (user?.status === eligible) await issueToken(db, user, purpose);
      });
      res.json({ message: genericRecovery });
    }));
  }
  router.post('/auth/login', rateLimit('login', 20), wrap(async (req, res) => {
    const email = validate.email(req.body?.email);
    const { rows: [user] } = await pool.query('SELECT * FROM users WHERE lower(email) = $1', [email]);
    if (!await verifyPassword(req.body?.password, user?.password_hash)) fail('Email or password is incorrect.', 401);
    if (user.status === 'INACTIVE') fail('Account is not verified. Please check your email to verify your account.', 403);
    if (user.status !== 'ACTIVE') fail('This account is suspended. Please contact the cinema.', 403);
    const raw = token();
    await transaction(pool, async db => {
      // Recheck credentials under the same lock used by reset/change-password.
      const { rows: [current] } = await db.query('SELECT status, password_hash FROM users WHERE id = $1 FOR UPDATE', [user.id]);
      if (current.status !== 'ACTIVE' || current.password_hash !== user.password_hash) fail('Your account changed. Please log in again.', 401);
      const old = sessionToken(req);
      if (old) await db.query('DELETE FROM user_sessions WHERE token_hash = $1', [digest(old)]);
      await db.query("DELETE FROM user_sessions WHERE expires_at <= now()");
      await db.query(`INSERT INTO user_sessions (token_hash, user_id, expires_at)
        VALUES ($1, $2, now() + interval '8 hours')`, [digest(raw), user.id]);
    });
    res.cookie(COOKIE, raw, { ...cookieOptions(), maxAge: 8 * 60 * 60 * 1000 });
    res.json({ user: await publicUser(pool, user.id) });
  }));
  router.post('/auth/logout', wrap(async (req, res) => {
    const raw = sessionToken(req);
    if (raw) await pool.query('DELETE FROM user_sessions WHERE token_hash = $1', [digest(raw)]);
    res.clearCookie(COOKIE, cookieOptions());
    res.json({ message: 'You have been logged out.' });
  }));
  router.post('/auth/reset-password', rateLimit('reset', 15), wrap(async (req, res) => {
    const raw = req.body?.token;
    if (typeof raw !== 'string' || !/^[a-f0-9]{64}$/.test(raw)) fail('This reset link is invalid or expired. Request a new one.');
    const secret = password(req.body.password);
    if (secret !== req.body.confirm_password) fail('Passwords do not match.');
    const hash = await hashPassword(secret);
    await transaction(pool, async db => {
      const { rows: [user] } = await db.query(
        `SELECT u.* FROM users u JOIN auth_tokens t ON t.user_id = u.id
         WHERE t.token_hash = $1 AND t.purpose = 'RESET_PASSWORD' FOR UPDATE OF u`, [digest(raw)]);
      if (!user || user.status !== 'ACTIVE') fail('This reset link is invalid or expired. Request a new one.');
      const result = await db.query(`UPDATE auth_tokens SET used_at = now() WHERE token_hash = $1
        AND purpose = 'RESET_PASSWORD' AND used_at IS NULL AND expires_at > now() RETURNING id`, [digest(raw)]);
      if (!result.rowCount) fail('This reset link is invalid or expired. Request a new one.');
      await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
      await db.query('DELETE FROM user_sessions WHERE user_id = $1', [user.id]);
      await db.query("UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND purpose = 'RESET_PASSWORD' AND used_at IS NULL", [user.id]);
      await notification(db, user, 'Your password was reset. All existing sessions have been logged out.');
    });
    res.clearCookie(COOKIE, cookieOptions());
    res.json({ message: 'Password reset successfully. Log in with your new password.' });
  }));

  router.get('/account', requireUser, wrap(async (req, res) => res.json({ user: await publicUser(pool, req.user.id) })));
  router.put('/account', requireUser, wrap(async (req, res) => {
    if (['email', 'role', 'status', 'password', 'password_hash', 'id'].some(key => key in (req.body || {}))) fail('Email, role, and account status cannot be changed here.');
    const data = validate.profile(req.body);
    const user = await transaction(pool, async db => {
      await db.query(`UPDATE users SET first_name=$1,last_name=$2,phone_number=$3,subscribed_to_promotions=$4,
        street=$5,city=$6,state=$7,zip_code=$8 WHERE id=$9`, [...data, req.user.id]);
      const updated = await publicUser(db, req.user.id);
      await notification(db, updated, 'Your personal profile or promotional email preferences were updated.');
      return updated;
    });
    res.json({ user, message: 'Profile saved. An email notification has been queued.' });
  }));
  router.post('/account/password', requireUser, rateLimit('change-password', 10), wrap(async (req, res) => {
    const secret = password(req.body?.password);
    if (secret !== req.body.confirm_password) fail('Passwords do not match.');
    if (secret === req.body.current_password) fail('Choose a password different from your current password.');
    const hash = await hashPassword(secret);
    await transaction(pool, async db => {
      const { rows: [user] } = await db.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
      if (!await verifyPassword(req.body.current_password, user.password_hash)) fail('Your current password is incorrect.', 403);
      await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
      await db.query('DELETE FROM user_sessions WHERE user_id = $1', [user.id]);
      await db.query("UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND purpose = 'RESET_PASSWORD' AND used_at IS NULL", [user.id]);
      await notification(db, user, 'Your password was changed. All existing sessions have been logged out.');
    });
    res.clearCookie(COOKIE, cookieOptions());
    res.json({ message: 'Password changed. Please log in again with your new password.' });
  }));
  router.get('/account/cards', requireUser, customer, wrap(async (req, res) => {
    const { rows } = await pool.query(`SELECT id, card_holder_name, last_four,
      to_char(expiration_date, 'YYYY-MM') AS expiration, billing_street, billing_city, billing_state, billing_zip_code
      FROM payment_cards WHERE customer_id = $1 ORDER BY id`, [req.user.id]);
    res.json(rows);
  }));
  router.post('/account/cards', requireUser, customer, wrap(async (req, res) => {
    const data = validate.card(req.body);
    await transaction(pool, async db => {
      await insertCard(db, req.user.id, data);
      await notification(db, req.user, `A payment card ending in ${data.number.slice(-4)} was added to your profile.`);
    });
    res.status(201).json({ message: 'Card saved. An email notification has been queued.' });
  }));
  router.put('/account/cards/:id', requireUser, customer, wrap(async (req, res) => {
    const id = validate.id(req.params.id);
    const data = validate.card(req.body);
    await transaction(pool, async db => {
      const result = await db.query(`UPDATE payment_cards SET encrypted_card_number=$1, card_holder_name=$2,
        expiration_date=$3,last_four=$4,billing_street=$5,billing_city=$6,billing_state=$7,billing_zip_code=$8
        WHERE id=$9 AND customer_id=$10`,
        [encrypt(data.number, `card:${req.user.id}`), data.holder, data.expiration, data.number.slice(-4), ...data.billing, id, req.user.id]);
      if (!result.rowCount) fail('Card not found.', 404);
      await notification(db, req.user, `Your saved payment card ending in ${data.number.slice(-4)} was updated.`);
    });
    res.json({ message: 'Card updated. An email notification has been queued.' });
  }));
  router.delete('/account/cards/:id', requireUser, customer, wrap(async (req, res) => {
    await transaction(pool, async db => {
      const result = await db.query('DELETE FROM payment_cards WHERE id=$1 AND customer_id=$2 RETURNING last_four', [validate.id(req.params.id), req.user.id]);
      if (!result.rowCount) fail('Card not found.', 404);
      await notification(db, req.user, `Your saved payment card ending in ${result.rows[0].last_four || '••••'} was removed.`);
    });
    res.json({ message: 'Card removed. An email notification has been queued.' });
  }));
  router.get('/account/favorites', requireUser, customer, wrap(async (req, res) => {
    const { rows } = await pool.query(`SELECT m.id, m.title, m.poster_image_url AS poster, m.synopsis AS description,
      replace(m.rating::text, '_', '-') AS rating FROM movies m JOIN customer_favorites f ON f.movie_id=m.id
      WHERE f.customer_id=$1 ORDER BY m.title`, [req.user.id]);
    res.json(rows);
  }));
  router.put('/account/favorites/:id', requireUser, customer, wrap(async (req, res) => {
    const id = validate.id(req.params.id);
    const result = await pool.query(`INSERT INTO customer_favorites (customer_id,movie_id)
      SELECT $1,id FROM movies WHERE id=$2 ON CONFLICT DO NOTHING`, [req.user.id, id]);
    if (!result.rowCount && !(await pool.query('SELECT id FROM movies WHERE id=$1', [id])).rowCount) fail('Movie not found.', 404);
    res.json({ message: 'Movie added to your favorites.' });
  }));
  router.delete('/account/favorites/:id', requireUser, customer, wrap(async (req, res) => {
    await pool.query('DELETE FROM customer_favorites WHERE customer_id=$1 AND movie_id=$2', [req.user.id, validate.id(req.params.id)]);
    res.json({ message: 'Movie removed from your favorites.' });
  }));
  router.get('/admin', requireUser, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Administrator access is required.' });
    res.json({ sections: ['Manage Movies', 'Promotions', 'Users', 'Showtimes'] });
  });
  router.use((error, req, res, next) => {
    if (!error.status) return next(error);
    res.status(error.status).json({ error: error.message });
  });
  return router;
}
module.exports = { accountRoutes, transaction };
