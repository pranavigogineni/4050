const fs = require('node:fs/promises');
const path = require('node:path');
const nodemailer = require('nodemailer');
const { encrypt, decrypt } = require('./security');

async function enqueue(db, to, subject, text) {
  await db.query('INSERT INTO email_outbox (encrypted_payload) VALUES ($1)',
    [encrypt(JSON.stringify({ to, subject, text }), 'email')]);
}
function publicOrigin() {
  const url = new URL(process.env.APP_URL || 'http://localhost:5001');
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('APP_URL must use HTTPS in production.');
  return url.origin;
}
function startMailWorker(pool) {
  let busy = false;
  let stopped = false;
  let transport;
  const fileMode = process.env.MAIL_MODE === 'file' && process.env.NODE_ENV !== 'production';
  if (!fileMode && process.env.SMTP_HOST) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      requireTLS: true,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: 10000, socketTimeout: 15000,
    });
  }
  if (!transport && !fileMode) console.warn('SMTP is not configured. Account emails will remain queued until SMTP is configured.');

  async function flush() {
    if (busy || stopped || (!transport && !fileMode)) return;
    busy = true;
    let db;
    try {
      db = await pool.connect();
      await db.query('BEGIN');
      const { rows: [row] } = await db.query(
        `SELECT * FROM email_outbox WHERE sent_at IS NULL AND next_attempt_at <= now()
         ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`);
      if (row) {
        try {
          const message = decrypt(row.encrypted_payload, 'email');
          if (fileMode) {
            const dir = process.env.MAIL_OUTPUT_DIR || path.join(__dirname, '..', '.mail');
            await fs.mkdir(dir, { recursive: true, mode: 0o700 });
            await fs.writeFile(path.join(dir, `${row.id}.json`), message, { mode: 0o600 });
          } else {
            const result = await transport.sendMail({
              ...JSON.parse(message),
              from: process.env.SMTP_FROM || process.env.SMTP_USER,
              messageId: `<cinemax-${process.env.DB_SCHEMA || 'public'}-${row.id}@${new URL(publicOrigin()).hostname}>`,
            });
            if (!result.accepted?.length) throw new Error('Recipient was not accepted');
          }
          await db.query('UPDATE email_outbox SET sent_at = now(), encrypted_payload = NULL WHERE id = $1', [row.id]);
        } catch {
          console.error(`Email ${row.id} could not be delivered; it will be retried.`);
          await db.query(`UPDATE email_outbox SET attempts = attempts + 1,
            next_attempt_at = now() + interval '1 minute' * least(60, power(2, least(attempts, 6))) WHERE id = $1`, [row.id]);
        }
      }
      await db.query('COMMIT');
    } catch {
      if (db) await db.query('ROLLBACK').catch(() => {});
      console.error('Email queue is unavailable; check that migrations have been applied.');
    } finally {
      db?.release();
      busy = false;
    }
  }
  const interval = setInterval(flush, 1000);
  interval.unref();
  flush();
  return () => { stopped = true; clearInterval(interval); transport?.close(); };
}
module.exports = { enqueue, startMailWorker, publicOrigin };
