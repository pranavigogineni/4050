-- Up Migration
-- Tables for the Cinema E-Booking domain class diagram (Deliverable 3).
-- Composite foreign keys enforce the diagram's notes declaratively; rules that
-- need counting live in 003_rules.sql.

-- ─── USERS ────────────────────────────────────────────────────────────────────
-- Customer and Admin share one table (single-table inheritance); `role` says which.
-- Accounts start INACTIVE and become ACTIVE once the email address is verified.
CREATE TABLE users (
  id                       integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role                     user_role   NOT NULL,
  first_name               text        NOT NULL,
  last_name                text        NOT NULL,
  email                    text        NOT NULL,
  password_hash            text        NOT NULL,
  phone_number             text        NOT NULL,
  status                   user_status NOT NULL DEFAULT 'INACTIVE',
  subscribed_to_promotions boolean     NOT NULL DEFAULT false,
  street                   text,
  city                     text,
  state                    text,
  zip_code                 text
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

-- At most three cards per user (trigger in 003_rules.sql). Never store CVVs.
CREATE TABLE payment_cards (
  id                    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id           integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  encrypted_card_number text    NOT NULL,
  card_holder_name      text    NOT NULL,
  expiration_date       date    NOT NULL,
  UNIQUE (id, customer_id)
);
CREATE INDEX payment_cards_customer_id_idx ON payment_cards (customer_id);

-- One-time tokens for Customer.verifyEmail(code) and User.resetPassword(token).
-- Only hashes of the tokens are stored.
CREATE TABLE auth_tokens (
  id         integer       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    integer       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose    token_purpose NOT NULL,
  token_hash text          NOT NULL UNIQUE,
  expires_at timestamptz   NOT NULL,
  used_at    timestamptz
);
CREATE INDEX auth_tokens_user_id_idx ON auth_tokens (user_id, purpose);

-- ─── CATALOG ──────────────────────────────────────────────────────────────────
-- Exactly one theatre exists: the unique index on a constant allows a single row.
-- The booking fee is charged once per booking; tax applies to the ticket subtotal.
CREATE TABLE theatres (
  id                 integer       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name               text          NOT NULL,
  online_booking_fee numeric(10,2) NOT NULL DEFAULT 0,
  tax_rate           numeric(6,4)  NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX theatres_singleton ON theatres ((true));

CREATE TABLE genres (
  id   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text    NOT NULL
);
CREATE UNIQUE INDEX genres_name_key ON genres (lower(name));

CREATE TABLE movies (
  id                integer      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  theatre_id        integer      NOT NULL REFERENCES theatres (id),
  title             text         NOT NULL,
  cast_members      text[]       NOT NULL DEFAULT '{}',
  director          text         NOT NULL,
  producer          text         NOT NULL,
  synopsis          text         NOT NULL,
  poster_image_url  text         NOT NULL,
  trailer_video_url text         NOT NULL,
  release_date      date,
  rating            mpaa_rating  NOT NULL,
  status            movie_status NOT NULL
);

-- Movie "categorized as" Genre (each movie has one or more genres).
CREATE TABLE movie_genres (
  movie_id integer NOT NULL REFERENCES movies (id) ON DELETE CASCADE,
  genre_id integer NOT NULL REFERENCES genres (id) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, genre_id)
);
CREATE INDEX movie_genres_genre_id_idx ON movie_genres (genre_id);

CREATE TABLE reviews (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  movie_id      integer NOT NULL REFERENCES movies (id) ON DELETE CASCADE,
  reviewer_name text    NOT NULL,
  score         integer NOT NULL,
  comment       text    NOT NULL DEFAULT '',
  review_date   date    NOT NULL DEFAULT CURRENT_DATE
);
CREATE INDEX reviews_movie_id_idx ON reviews (movie_id);

-- ─── FAVORITES ────────────────────────────────────────────────────────────────
-- The Recommendation Service computes suggestions from favorites and booking
-- history on request, so recommendations and preference profiles are not stored.
CREATE TABLE customer_favorites (
  customer_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  movie_id    integer NOT NULL REFERENCES movies (id) ON DELETE CASCADE,
  PRIMARY KEY (customer_id, movie_id)
);

-- ─── SHOWROOMS & SHOWS ────────────────────────────────────────────────────────
CREATE TABLE showrooms (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  theatre_id    integer NOT NULL REFERENCES theatres (id) ON DELETE CASCADE,
  name          text    NOT NULL,
  seat_capacity integer NOT NULL,
  UNIQUE (theatre_id, name)
);

-- UNIQUE (id, showroom_id) is the target for "seat belongs to the show's showroom".
CREATE TABLE seats (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  showroom_id integer NOT NULL REFERENCES showrooms (id) ON DELETE CASCADE,
  row_label   text    NOT NULL,
  seat_number integer NOT NULL,
  UNIQUE (showroom_id, row_label, seat_number),
  UNIQUE (id, showroom_id)
);

-- show_date and show_time are the theatre's local date and time.
-- Shows in the same showroom cannot overlap; back-to-back shows are allowed.
CREATE TABLE shows (
  id          integer   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  movie_id    integer   NOT NULL REFERENCES movies (id),
  showroom_id integer   NOT NULL REFERENCES showrooms (id),
  show_date   date      NOT NULL,
  show_time   time      NOT NULL,
  duration    integer   NOT NULL,
  starts_at   timestamp GENERATED ALWAYS AS (show_date + show_time) STORED,
  ends_at     timestamp GENERATED ALWAYS AS (show_date + show_time + duration * interval '1 minute') STORED,
  UNIQUE (id, showroom_id),
  CONSTRAINT shows_no_overlap EXCLUDE USING gist (showroom_id WITH =, tsrange(starts_at, ends_at) WITH &&)
);
CREATE INDEX shows_movie_id_idx ON shows (movie_id, starts_at);

-- ─── PRICING ──────────────────────────────────────────────────────────────────
CREATE TABLE ticket_types (
  id           integer       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         text          NOT NULL,
  age_criteria text          NOT NULL,
  price        numeric(10,2) NOT NULL
);
CREATE UNIQUE INDEX ticket_types_name_key ON ticket_types (lower(name));

CREATE TABLE promotions (
  id               integer      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  promo_code       text         NOT NULL,
  description      text         NOT NULL,
  discount_percent numeric(5,2) NOT NULL,
  start_date       date         NOT NULL,
  end_date         date         NOT NULL
);
CREATE UNIQUE INDEX promotions_promo_code_key ON promotions (lower(promo_code));

-- ─── SEAT HOLDS ───────────────────────────────────────────────────────────────
-- A selection belongs to a customer once they log in.
CREATE TABLE booking_selections (
  id              integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id     integer     REFERENCES users (id) ON DELETE CASCADE,
  show_id         integer     NOT NULL REFERENCES shows (id) ON DELETE CASCADE,
  hold_expires_at timestamptz,
  UNIQUE (id, show_id)
);
CREATE INDEX booking_selections_show_id_idx ON booking_selections (show_id);

-- show_id and showroom_id are copied from the selection and show so composite keys can
-- check that the seat is in the show's showroom. Only one hold may exist per show and
-- seat: the hold transaction deletes expired holds before inserting.
CREATE TABLE selected_seats (
  id             integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  selection_id   integer     NOT NULL,
  show_id        integer     NOT NULL,
  showroom_id    integer     NOT NULL,
  seat_id        integer     NOT NULL,
  ticket_type_id integer     REFERENCES ticket_types (id),
  selected_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (selection_id, show_id) REFERENCES booking_selections (id, show_id) ON DELETE CASCADE,
  FOREIGN KEY (show_id, showroom_id)  REFERENCES shows (id, showroom_id) ON DELETE CASCADE,
  FOREIGN KEY (seat_id, showroom_id)  REFERENCES seats (id, showroom_id) ON DELETE CASCADE,
  UNIQUE (show_id, seat_id)
);
CREATE INDEX selected_seats_selection_id_idx ON selected_seats (selection_id);

-- ─── BOOKINGS & TICKETS ───────────────────────────────────────────────────────
-- The saved card must belong to the booking's customer. Deleting the card keeps the
-- booking and clears only payment_card_id.
CREATE TABLE bookings (
  id                      integer        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id             integer        NOT NULL REFERENCES users (id),
  show_id                 integer        NOT NULL REFERENCES shows (id),
  selection_id            integer        UNIQUE REFERENCES booking_selections (id) ON DELETE SET NULL,
  payment_card_id         integer,
  promotion_id            integer        REFERENCES promotions (id),
  booking_date            timestamptz    NOT NULL DEFAULT now(),
  movie_title_snapshot    text           NOT NULL,
  show_date_time_snapshot timestamp      NOT NULL,
  subtotal                numeric(10,2)  NOT NULL,
  sales_tax               numeric(10,2)  NOT NULL,
  booking_fee             numeric(10,2)  NOT NULL,
  discount                numeric(10,2)  NOT NULL DEFAULT 0,
  total_price             numeric(10,2)  NOT NULL,
  payment_reference       text,
  payment_status          text           NOT NULL DEFAULT 'PENDING',
  payment_idempotency_key text           UNIQUE,
  status                  booking_status NOT NULL DEFAULT 'PENDING',
  UNIQUE (id, show_id),
  FOREIGN KEY (payment_card_id, customer_id) REFERENCES payment_cards (id, customer_id) ON DELETE SET NULL (payment_card_id)
);
CREATE INDEX bookings_customer_id_idx ON bookings (customer_id);
CREATE INDEX bookings_show_id_idx ON bookings (show_id);

-- All tickets are for the booking's show, each seat is in that show's showroom, and a
-- seat has at most one active (not cancelled) ticket per show.
CREATE TABLE tickets (
  id                   integer       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id           integer       NOT NULL,
  show_id              integer       NOT NULL,
  showroom_id          integer       NOT NULL,
  seat_id              integer       NOT NULL,
  ticket_type_id       integer       NOT NULL REFERENCES ticket_types (id),
  seat_label_snapshot  text          NOT NULL,
  ticket_type_snapshot text          NOT NULL,
  price_paid           numeric(10,2) NOT NULL,
  cancelled            boolean       NOT NULL DEFAULT false,
  refund_amount        numeric(10,2) NOT NULL DEFAULT 0,
  refund_reference     text,
  refund_status        text          NOT NULL DEFAULT 'NONE',
  FOREIGN KEY (booking_id, show_id)  REFERENCES bookings (id, show_id) ON DELETE CASCADE,
  FOREIGN KEY (show_id, showroom_id) REFERENCES shows (id, showroom_id),
  FOREIGN KEY (seat_id, showroom_id) REFERENCES seats (id, showroom_id)
);
CREATE INDEX tickets_booking_id_idx ON tickets (booking_id);
CREATE UNIQUE INDEX tickets_one_active_per_seat ON tickets (show_id, seat_id) WHERE NOT cancelled;

-- Down Migration

DROP TABLE tickets;
DROP TABLE bookings;
DROP TABLE selected_seats;
DROP TABLE booking_selections;
DROP TABLE promotions;
DROP TABLE ticket_types;
DROP TABLE shows;
DROP TABLE seats;
DROP TABLE showrooms;
DROP TABLE customer_favorites;
DROP TABLE reviews;
DROP TABLE movie_genres;
DROP TABLE movies;
DROP TABLE genres;
DROP TABLE theatres;
DROP TABLE auth_tokens;
DROP TABLE payment_cards;
DROP TABLE users;
