export const ADMIN_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS admin_operations (
    request_id UUID PRIMARY KEY,
    actor_id UUID NOT NULL REFERENCES users(id),
    target_id UUID NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CONSTRAINT admin_operations_kind_check CHECK (kind IN ('revoke-sessions', 'grant-points', 'revoke-points', 'grant-item', 'revoke-item')),
    fingerprint TEXT NOT NULL,
    reason TEXT NOT NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE admin_operations DROP CONSTRAINT IF EXISTS admin_operations_kind_check;
  ALTER TABLE admin_operations ADD CONSTRAINT admin_operations_kind_check CHECK (kind IN ('revoke-sessions', 'grant-points', 'revoke-points', 'grant-item', 'revoke-item'));
  CREATE INDEX IF NOT EXISTS admin_operations_created_idx ON admin_operations(created_at DESC, request_id);
  CREATE TABLE IF NOT EXISTS admin_revoked_web_sessions (
    sid VARCHAR PRIMARY KEY,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;
