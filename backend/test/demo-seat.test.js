const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTestSchema, dropTestSchema } = require('../db/isolated-schema');
const { createDemoBookedSeat } = require('../scripts/demo-booked-seat');
test('booked-seat demo is repeatable, correctly scoped, and never charges or emails', async () => {
  const schema = `test_demo_${process.pid}_${Date.now()}`;
  const pool = await createTestSchema(schema);
  try {
    const first = await createDemoBookedSeat(pool);
    const second = await createDemoBookedSeat(pool);
    assert.equal(first.created, true); assert.equal(second.created, false);
    assert.equal(first.id, second.id); assert.equal(first.seat, second.seat);
    const { rows: [row] } = await pool.query(`SELECT b.total_price,b.payment_status,t.cancelled,
      u.status,u.subscribed_to_promotions FROM bookings b JOIN tickets t ON t.booking_id=b.id
      JOIN users u ON u.id=b.customer_id WHERE b.show_id=$1`, [first.id]);
    assert.equal(row.total_price, '0.00'); assert.equal(row.payment_status, 'DEMO');
    assert.equal(row.cancelled, false); assert.equal(row.status, 'INACTIVE'); assert.equal(row.subscribed_to_promotions, false);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM tickets')).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM email_outbox')).rows[0].n, 0);
  } finally { await dropTestSchema(pool, schema); await pool.end(); }
});
