// Explicit demo fixture: never charges a card or sends email. Safe to rerun.
const { createPool, THEATRE_TIMEZONE } = require('../db/connection');
const { transaction } = require('../accounts/routes');
async function createDemoBookedSeat(pool) {
  return transaction(pool, async db => {
    await db.query('SELECT pg_advisory_xact_lock(4050037)');
    const { rows: [show] } = await db.query(`SELECT s.id,s.movie_id,s.showroom_id,s.starts_at,
      s.show_date::text AS date,s.show_time::text AS time,m.title,r.name AS showroom
      FROM shows s JOIN movies m ON m.id=s.movie_id JOIN showrooms r ON r.id=s.showroom_id
      WHERE s.starts_at > now() AT TIME ZONE $1 AND m.status='NOW_PLAYING'
      ORDER BY s.starts_at,s.movie_id,s.id LIMIT 1 FOR UPDATE OF s`, [THEATRE_TIMEZONE]);
    if (!show) throw new Error('No upcoming shows. Run npm run seed first.');
    const key = `cinemax-demo-seat:${show.id}`;
    const { rows: existing } = await db.query(`SELECT t.seat_label_snapshot AS seat FROM bookings b
      JOIN tickets t ON t.booking_id=b.id WHERE b.payment_idempotency_key=$1 AND NOT t.cancelled`, [key]);
    if (existing.length) return { ...show, seat: existing[0].seat, created: false };
    if ((await db.query('SELECT id FROM bookings WHERE payment_idempotency_key=$1', [key])).rowCount) {
      throw new Error('This demo booking was modified. Inspect it before creating another fixture.');
    }
    const { rows: [seat] } = await db.query(`SELECT id,row_label || seat_number::text AS label FROM seats s
      WHERE showroom_id=$1 AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.show_id=$2 AND t.seat_id=s.id AND NOT t.cancelled)
      AND NOT EXISTS (SELECT 1 FROM selected_seats ss JOIN booking_selections bs ON bs.id=ss.selection_id
        WHERE ss.show_id=$2 AND ss.seat_id=s.id AND (bs.hold_expires_at IS NULL OR bs.hold_expires_at>now()))
      ORDER BY row_label,seat_number LIMIT 1`, [show.showroom_id, show.id]);
    if (!seat) throw new Error('The next show has no available seats for a demo fixture.');
    const { rows: [type] } = await db.query("SELECT id,name FROM ticket_types WHERE lower(name)='adult'");
    if (!type) throw new Error('Adult ticket type is missing. Run database setup first.');
    await db.query(`INSERT INTO users (role,first_name,last_name,email,password_hash,phone_number,status,subscribed_to_promotions)
      VALUES ('customer','Demo','Booked Seat','booked-seat-demo@cinemax.invalid','DEMO_NO_LOGIN','0000000000','INACTIVE',false)
      ON CONFLICT ((lower(email))) DO NOTHING`);
    const { rows: [user] } = await db.query(`SELECT id FROM users WHERE email='booked-seat-demo@cinemax.invalid'
      AND password_hash='DEMO_NO_LOGIN' AND status='INACTIVE' AND role='customer' AND NOT subscribed_to_promotions`);
    if (!user) throw new Error('The reserved demo email belongs to a different account. No changes were made.');
    const { rows: [booking] } = await db.query(`INSERT INTO bookings
      (customer_id,show_id,movie_title_snapshot,show_date_time_snapshot,subtotal,sales_tax,booking_fee,total_price,
       payment_reference,payment_status,payment_idempotency_key,status)
      VALUES ($1,$2,$3,$4,0,0,0,0,'DEMO - no payment collected','DEMO',$5,'CONFIRMED') RETURNING id`,
      [user.id, show.id, show.title, show.starts_at, key]);
    await db.query(`INSERT INTO tickets (booking_id,show_id,showroom_id,seat_id,ticket_type_id,seat_label_snapshot,ticket_type_snapshot,price_paid)
      VALUES ($1,$2,$3,$4,$5,$6,$7,0)`, [booking.id, show.id, show.showroom_id, seat.id, type.id, seat.label, type.name]);
    return { ...show, seat: seat.label, created: true };
  });
}
if (require.main === module) {
  const pool = createPool();
  createDemoBookedSeat(pool).then(result => {
    console.log(`${result.created ? 'Created' : 'Reused'} demo booked seat ${result.seat}: ${result.title}, ${result.date} ${result.time}, ${result.showroom} (Eastern Time).`);
    console.log(`Open http://localhost:${process.env.PORT || 5001}/booking/${result.movie_id}/${result.id}`);
    console.log('This is a zero-dollar demo fixture. No payment or email was sent.');
  }).catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
}
module.exports = { createDemoBookedSeat };
