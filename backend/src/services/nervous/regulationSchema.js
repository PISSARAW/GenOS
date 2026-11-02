'use strict';

const CONTROL_SCHEMA = `
CREATE TABLE IF NOT EXISTS gns_regulation_policies (
  manager_id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL,
  version INTEGER NOT NULL, body_json TEXT NOT NULL, enabled INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gns_admission_holds (
  effect_id TEXT PRIMARY KEY, manager_id TEXT NOT NULL, organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL, policy_version INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL, released_at INTEGER, admission_limit INTEGER NOT NULL,
  capacity INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS gns_hold_manager ON gns_admission_holds(manager_id,expires_at);
`;

const JOURNAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS nervous_garage_samples (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
  organization_id TEXT NOT NULL, project_id TEXT NOT NULL, manager_id TEXT NOT NULL,
  observed_at INTEGER NOT NULL, body_json TEXT NOT NULL, signal_id TEXT
);
CREATE INDEX IF NOT EXISTS nervous_sample_manager
  ON nervous_garage_samples(organization_id,project_id,manager_id,sequence);
CREATE TABLE IF NOT EXISTS nervous_regulation_episodes (
  effect_id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL,
  manager_id TEXT NOT NULL, status TEXT NOT NULL, body_json TEXT NOT NULL,
  verdict_json TEXT, denied_count INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS nervous_episode_manager
  ON nervous_regulation_episodes(organization_id,project_id,manager_id,status);
`;

module.exports = { CONTROL_SCHEMA, JOURNAL_SCHEMA };
