// Promotes an existing, email-verified customer; never creates default credentials.
const { createPool } = require('../db/connection');
const { email } = require('../accounts/validation');
async function main() {
  const address = email(process.argv[2]);
  const pool = createPool();
  try {
    const result = await pool.query("UPDATE users SET role = 'admin' WHERE lower(email) = $1 AND status = 'ACTIVE' RETURNING id", [address]);
    if (!result.rowCount) throw new Error('No active account found. Register and verify this email first.');
    await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [result.rows[0].id]);
    console.log('Administrator role granted. Log in again to open the admin portal.');
  } finally { await pool.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
