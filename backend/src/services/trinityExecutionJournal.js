'use strict';
const crypto = require('node:crypto');
const os = require('node:os');
const { withTransaction } = require('../db');

async function initialize(db) {
  await db.run('CREATE TABLE IF NOT EXISTS trinity_runtime_journal (mission_id TEXT NOT NULL, stage TEXT NOT NULL, input_hash TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY(mission_id, stage))');
  await db.run('CREATE TABLE IF NOT EXISTS trinity_runtime_locks (mission_id TEXT PRIMARY KEY, owner TEXT NOT NULL, host TEXT NOT NULL, pid INTEGER NOT NULL)');
}
function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(JSON.parse(JSON.stringify(value))))).digest('hex');
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
async function read(db, missionId, stage) {
  await initialize(db);
  const row = await db.get('SELECT value_json FROM trinity_runtime_journal WHERE mission_id = ? AND stage = ?', missionId, stage);
  return row ? decode(row.value_json) : null;
}
async function phase(context, stage, execute) {
  const { db, missionId, configuration } = context;
  await initialize(db);
  const hash = digest(configuration);
  const existing = await db.get('SELECT input_hash, value_json FROM trinity_runtime_journal WHERE mission_id = ? AND stage = ?', missionId, stage);
  if (existing) {
    if (existing.input_hash !== hash) throw failure('TRINITY_REPLAY_CONFIGURATION_CHANGED');
    return decode(existing.value_json);
  }
  const value = await execute();
  const json = JSON.stringify({ value, digest: digest(value) });
  if (Buffer.byteLength(json) > 16 * 1024 * 1024) throw failure('TRINITY_JOURNAL_BOUND_EXCEEDED');
  await db.run('INSERT INTO trinity_runtime_journal (mission_id, stage, input_hash, value_json) VALUES (?, ?, ?, ?)', missionId, stage, hash, json);
  return value;
}
function decode(json) {
  const record = JSON.parse(json);
  if (!record || record.digest !== digest(record.value)) throw failure('TRINITY_JOURNAL_CORRUPT');
  return record.value;
}
function failure(code) {
  return Object.assign(new Error(code), { code });
}
function ownerAlive(lock) {
  if (lock.host !== os.hostname()) return true;
  try { process.kill(lock.pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}
async function acquire(db, missionId) {
  await initialize(db);
  const owner = crypto.randomUUID();
  await withTransaction(db, async tx => {
    const previous = await tx.get('SELECT owner, host, pid FROM trinity_runtime_locks WHERE mission_id = ?', missionId);
    if (previous && ownerAlive(previous)) throw failure('TRINITY_EXECUTION_BUSY');
    if (previous) await tx.run('DELETE FROM trinity_runtime_locks WHERE mission_id = ? AND owner = ?', missionId, previous.owner);
    await tx.run('INSERT INTO trinity_runtime_locks (mission_id, owner, host, pid) VALUES (?, ?, ?, ?)', missionId, owner, os.hostname(), process.pid);
  });
  return () => db.run('DELETE FROM trinity_runtime_locks WHERE mission_id = ? AND owner = ?', missionId, owner);
}
async function resumeComparison(context, reports, execute) {
  const { db, input } = context;
  if (!input.missionId) return execute(reports, async (_, run) => run());
  const release = await acquire(db, input.missionId);
  try {
    const journal = { db, missionId: input.missionId, configuration: input };
    const initial = await phase(journal, 'initial_reports', async () => reports);
    return await phase(journal, 'comparison', () => execute(initial, (stage, run) => phase(journal, stage, run)));
  } finally { await release(); }
}
module.exports = { read, phase, acquire, resumeComparison, digest };
