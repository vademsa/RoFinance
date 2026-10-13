export const COMMUNITY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS engagement_reward_claims (
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK (kind IN ('daily','adoption')),
 reward_key TEXT NOT NULL,
 points INTEGER NOT NULL CHECK (points = 20),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY (user_id, kind, reward_key)
);
CREATE TABLE IF NOT EXISTS community_jar_plans (
 id UUID PRIMARY KEY,
 owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 design JSONB NOT NULL,
 layout_hash TEXT NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE (owner_id, layout_hash)
);
CREATE TABLE IF NOT EXISTS community_plan_adoptions (
 plan_id UUID NOT NULL REFERENCES community_jar_plans(id),
 adopter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY (plan_id, adopter_id)
);
CREATE TABLE IF NOT EXISTS community_plan_actions (
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 request_id UUID NOT NULL,
 plan_id UUID NOT NULL,
 rewarded BOOLEAN NOT NULL,
 PRIMARY KEY (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS community_plans_listing_idx ON community_jar_plans(active, created_at DESC);
`;
