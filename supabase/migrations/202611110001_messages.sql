-- Run as the database owner, NOT through the public PostgREST API.
CREATE TABLE IF NOT EXISTS hush_messages (
  id TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  access_hash TEXT NOT NULL,
  revoke_hash TEXT NOT NULL,
  pin_hash TEXT NOT NULL DEFAULT '',
  expires_at BIGINT NOT NULL,
  burn INTEGER NOT NULL CHECK (burn IN (0,1)),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5)
);
CREATE INDEX IF NOT EXISTS hush_expiry ON hush_messages (expires_at);
