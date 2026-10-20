-- Up Migration
CREATE TABLE user_sessions (
  token_hash text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX user_sessions_user_idx ON user_sessions(user_id);
CREATE INDEX user_sessions_expiry_idx ON user_sessions(expires_at);

ALTER TABLE payment_cards ADD COLUMN last_four text;
ALTER TABLE payment_cards ADD COLUMN billing_street text;
ALTER TABLE payment_cards ADD COLUMN billing_city text;
ALTER TABLE payment_cards ADD COLUMN billing_state text;
ALTER TABLE payment_cards ADD COLUMN billing_zip_code text;

-- Encrypted email payloads are committed with account changes, then delivered by
-- the worker. A failed SMTP request never loses a notification or rolls back a
-- successfully saved profile. Sent payloads are erased.
CREATE TABLE email_outbox (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  encrypted_payload text,
  created_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  sent_at timestamptz
);
CREATE INDEX email_outbox_pending_idx ON email_outbox(next_attempt_at) WHERE sent_at IS NULL;

-- Shared across server processes; stores hashes rather than IPs/email addresses.
CREATE TABLE auth_rate_limits (
  key_hash text PRIMARY KEY,
  attempts integer NOT NULL,
  expires_at timestamptz NOT NULL
);
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- Down Migration
DROP TABLE auth_rate_limits;
DROP TABLE email_outbox;
ALTER TABLE payment_cards DROP COLUMN billing_zip_code;
ALTER TABLE payment_cards DROP COLUMN billing_state;
ALTER TABLE payment_cards DROP COLUMN billing_city;
ALTER TABLE payment_cards DROP COLUMN billing_street;
ALTER TABLE payment_cards DROP COLUMN last_four;
DROP TABLE user_sessions;
