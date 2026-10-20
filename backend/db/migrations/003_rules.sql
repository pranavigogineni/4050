-- Up Migration
-- Rules that need a count, so they cannot be CHECK constraints. Each trigger locks the
-- parent row first so concurrent inserts are counted one after another.

-- A customer may store at most three payment cards.
CREATE FUNCTION enforce_payment_card_limit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM users WHERE id = NEW.customer_id FOR UPDATE;
  IF (SELECT count(*) FROM payment_cards WHERE customer_id = NEW.customer_id) > 3 THEN
    RAISE EXCEPTION 'customer % already has 3 payment cards', NEW.customer_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER payment_card_limit
  AFTER INSERT OR UPDATE OF customer_id ON payment_cards
  FOR EACH ROW EXECUTE FUNCTION enforce_payment_card_limit();

-- A showroom cannot have more seats than its seat_capacity.
CREATE FUNCTION enforce_seat_capacity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  room_id  integer;
  capacity integer;
BEGIN
  IF TG_TABLE_NAME = 'seats' THEN
    room_id := NEW.showroom_id;
  ELSE
    room_id := NEW.id;
  END IF;
  SELECT seat_capacity INTO capacity FROM showrooms WHERE id = room_id FOR UPDATE;
  IF (SELECT count(*) FROM seats WHERE showroom_id = room_id) > capacity THEN
    RAISE EXCEPTION 'showroom % has more seats than its capacity of %', room_id, capacity
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER seat_capacity_on_seats
  AFTER INSERT OR UPDATE OF showroom_id ON seats
  FOR EACH ROW EXECUTE FUNCTION enforce_seat_capacity();

CREATE TRIGGER seat_capacity_on_showrooms
  AFTER UPDATE OF seat_capacity ON showrooms
  FOR EACH ROW EXECUTE FUNCTION enforce_seat_capacity();

-- Down Migration

DROP TRIGGER seat_capacity_on_showrooms ON showrooms;
DROP TRIGGER seat_capacity_on_seats ON seats;
DROP FUNCTION enforce_seat_capacity();
DROP TRIGGER payment_card_limit ON payment_cards;
DROP FUNCTION enforce_payment_card_limit();
