'use strict';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS nervous_signals (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL, project_id TEXT NOT NULL, agent_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL, body TEXT NOT NULL, processed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS nervous_pending ON nervous_signals(processed, sequence);
CREATE INDEX IF NOT EXISTS nervous_scope ON nervous_signals(organization_id, project_id, sequence);
CREATE TABLE IF NOT EXISTS nervous_states (
  organization_id TEXT NOT NULL, project_id TEXT NOT NULL, agent_id TEXT NOT NULL,
  body TEXT NOT NULL, PRIMARY KEY(organization_id, project_id, agent_id)
);
CREATE TABLE IF NOT EXISTS nervous_receipts (
  signal_id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL,
  body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS nervous_effects (
  id TEXT PRIMARY KEY, signal_id TEXT NOT NULL, organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL, status TEXT NOT NULL, body TEXT NOT NULL,
  outcome TEXT, FOREIGN KEY(signal_id) REFERENCES nervous_signals(id)
);
CREATE INDEX IF NOT EXISTS nervous_effect_scope ON nervous_effects(organization_id, project_id, status);
`;

module.exports = { SCHEMA };
