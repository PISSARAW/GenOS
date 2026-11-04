'use strict';

const { open } = require('../../backend/node_modules/sqlite');
const sqlite3 = require('../../backend/node_modules/sqlite3');
const episodic = require('../../backend/src/services/ontogenesis/memoryService');
const { AdaptiveStateService } = require('../../backend/src/services/adaptiveStateService');
const { hash, relevant } = require('./corpus.cjs');

async function connect(filename) {
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec(`CREATE TABLE IF NOT EXISTS ontogenesis_memory (
    id TEXT PRIMARY KEY, project_id TEXT, kind TEXT, content TEXT, provenance_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS adaptive_state (
    scope TEXT,key TEXT,payload_json TEXT,version INTEGER,updated_at TEXT,PRIMARY KEY(scope,key));
    CREATE TABLE IF NOT EXISTS adaptive_state_events (
    scope TEXT,key TEXT,event_type TEXT,event_payload TEXT,created_at TEXT);`);
  return db;
}

async function ingest(db, input) {
  await episodic.recordMemory(db, { id: input.worldId + ':' + input.observation.step,
    projectId: input.worldId, kind: 'constraint', content: JSON.stringify(input.observation),
    provenance: { phase: 'training', observationHash: hash(input.observation), eventHash: input.eventHash } });
}

async function history(db, worldId) {
  const rows = await episodic.listMemories(db, worldId, 'constraint');
  return rows.map(row => JSON.parse(row.content)).sort((a, b) => a.step - b.step);
}

async function recall(db, input) {
  return relevant(await history(db, input.worldId), input.query);
}

async function checkpoint(db, worldId) {
  const rows = await history(db, worldId);
  const state = { count: rows.length, observationHash: hash(rows) };
  await new AdaptiveStateService(db).persistObject('five-arm-study', worldId, state, rows.length);
  return state;
}

async function restore(db, worldId) {
  const state = await new AdaptiveStateService(db).restoreObject('five-arm-study', worldId);
  if (state.observationHash !== hash(await history(db, worldId))) throw Error('Restored memory hash mismatch');
  return state;
}

module.exports = { connect, ingest, history, recall, checkpoint, restore };
