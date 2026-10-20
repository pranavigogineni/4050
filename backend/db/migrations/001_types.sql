-- Up Migration

-- btree_gist lets the shows exclusion constraint combine "same showroom" with "overlapping time".
-- Supabase keeps extensions in the `extensions` schema; plain PostgreSQL uses `public`.
-- It is shared by every schema in the database, so the down migration leaves it installed.
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

-- Enumerations from the domain class diagram, plus token_purpose for auth_tokens.
-- user_status is the diagram's CustomerStatus; it now applies to every user so admins
-- can suspend any account.
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
