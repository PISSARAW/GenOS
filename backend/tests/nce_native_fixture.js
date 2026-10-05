'use strict';

const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nce-native-'));
  const filename = path.join(root, 'state.db');
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT, role TEXT, status TEXT, execution_mode TEXT);
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT UNIQUE, path TEXT);
    CREATE TABLE agent_phenotype_states (
    id TEXT PRIMARY KEY, agent_id TEXT REFERENCES agents(id), genome_id TEXT, state_json TEXT,
    phenotype_json TEXT, branches_json TEXT, atrophies_json TEXT, history_json TEXT,
    created_at TEXT, updated_at TEXT);
    CREATE TABLE workspace_snapshots (
    id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id), snapshot_hash TEXT, step_number INTEGER,
    label TEXT, author TEXT, reason TEXT, diff_summary TEXT, metadata TEXT);`);
  return { root, db, filename };
}

module.exports = { fixture };
