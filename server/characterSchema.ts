import { COMMUNITY_SCHEMA_SQL } from './communitySchema';
export const CHARACTER_SCHEMA_SQL = COMMUNITY_SCHEMA_SQL + `
  CREATE TABLE IF NOT EXISTS character_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    state JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS character_actions (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    fingerprint TEXT NOT NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, request_id)
  );
  CREATE TABLE IF NOT EXISTS character_point_grants (
    request_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL CHECK (points BETWEEN 1 AND 100000),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS character_rankings (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    season VARCHAR(7) NOT NULL CHECK (season ~ '^\\d{4}-\\d{2}$'),
    nickname VARCHAR(24) NOT NULL,
    character_id TEXT NOT NULL,
    equipment JSONB NOT NULL,
    score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    PRIMARY KEY (user_id, season)
  );
  CREATE INDEX IF NOT EXISTS character_rankings_season_score_idx ON character_rankings(season, score DESC);
  ALTER TABLE character_rankings ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT 'male' CHECK (gender IN ('male', 'female'));
`;
