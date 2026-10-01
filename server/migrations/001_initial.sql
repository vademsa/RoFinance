CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  avatar_data BYTEA,
  avatar_mime TEXT,
  avatar_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email));
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data BYTEA;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mime TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_version INTEGER NOT NULL DEFAULT 0;
UPDATE users
SET display_name = LEFT(SPLIT_PART(email, '@', 1), 60)
WHERE display_name IS NULL OR BTRIM(display_name) = '';
ALTER TABLE users ALTER COLUMN display_name SET NOT NULL;
CREATE TABLE IF NOT EXISTS auth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple')),
  provider_subject TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_subject),
  UNIQUE(user_id, provider)
);
CREATE TABLE IF NOT EXISTS user_data (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE user_data ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS mobile_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS mobile_sessions_user_id_idx ON mobile_sessions(user_id);
CREATE TABLE IF NOT EXISTS mobile_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES mobile_sessions(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS mobile_refresh_tokens_session_id_idx ON mobile_refresh_tokens(session_id);
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  is_secret BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
