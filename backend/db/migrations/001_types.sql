-- Up Migration

-- Prevents double-booking the same room at the same time.
-- Left installed during rollbacks because other parts of the database may share it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') THEN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
      CREATE EXTENSION btree_gist WITH SCHEMA extensions;
    ELSE
      CREATE EXTENSION btree_gist WITH SCHEMA public;
    END IF;
  END IF;
END $$;

-- Adds choice lists (enums) from the design, plus extra ones for auth tokens.
-- user_status lets admins suspend any user account, not just customers.
CREATE TYPE user_role      AS ENUM ('customer', 'admin');
CREATE TYPE user_status    AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
CREATE TYPE token_purpose  AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');
CREATE TYPE mpaa_rating    AS ENUM ('G', 'PG', 'PG_13', 'R', 'NC_17');
CREATE TYPE movie_status   AS ENUM ('NOW_PLAYING', 'COMING_SOON');
CREATE TYPE booking_status AS ENUM ('PENDING', 'CONFIRMED', 'PARTIALLY_CANCELLED', 'CANCELLED', 'EXPIRED');

-- Down Migration

DROP TYPE booking_status;
DROP TYPE movie_status;
DROP TYPE mpaa_rating;
DROP TYPE token_purpose;
DROP TYPE user_status;
DROP TYPE user_role;
