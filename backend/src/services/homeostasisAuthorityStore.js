'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { migrateHomeostasisAuthority } = require('../db/migrations/migrateHomeostasisAuthority');
const { serializeContract, deserializeContract, resolveVerifier } = require('./homeostasisContractService');
const { digest } = require('./biologicalIntegrity');
const migrated = new WeakSet();

async function ensure(db) {
  if (migrated.has(db)) return;
  await migrateHomeostasisAuthority(db);
  migrated.add(db);
}

function content(payload) {
  const result = { ...payload };
  delete result.assembledAt;
  return result;
}

function loadRow(row) {
  if (!row) return null;
  const payload = JSON.parse(row.contract_json);
  const value = content(payload);
  const legacy = crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  if (row.contract_hash !== digest(value) && row.contract_hash !== legacy) {
    throw new Error('Homeostasis authority integrity mismatch');
  }
  return { ...deserializeContract(payload), revision: row.revision, contractHash: row.contract_hash };
}

async function active(db, missionId) {
  await ensure(db);
  return loadRow(await db.get(`SELECT r.* FROM homeostasis_contract_revisions r
    JOIN homeostasis_contract_heads h ON h.mission_id = r.mission_id AND h.revision = r.revision
    WHERE r.mission_id = ?`, missionId));
}

function declarativePayload(proposed, missionId) {
  const payload = serializeContract(proposed);
  if (payload.missionId !== missionId) throw new Error('Homeostasis mission identity mismatch');
  for (const invariant of payload.invariants) resolveVerifier({ verifier: invariant.verifier });
  const restored = deserializeContract(payload);
  return serializeContract(restored);
}

async function resolve(db, input) {
  await ensure(db);
  return withTransaction(db, async () => {
    const current = await active(db, input.missionId);
    if (current && !input.explicit) return current;
    const payload = declarativePayload(input.proposed(), input.missionId);
    const hash = digest(content(payload));
    if (current && digest(content(serializeContract(current))) === hash) return current;
    assertRevision(current, input.expectedRevision);
    const authority = await insertRevision(db, { missionId: input.missionId, payload, hash });
    await db.run(`INSERT INTO homeostasis_contract_heads (mission_id, revision) VALUES (?, ?)
      ON CONFLICT(mission_id) DO UPDATE SET revision = excluded.revision`, input.missionId, authority.revision);
    return authority;
  });
}

function assertRevision(current, expected) {
  if (!current && (expected === undefined || expected === 0)) return;
  if (current && expected === current.revision) return;
  throw Object.assign(new Error('Updating homeostasis requires the current expected revision'),
    { code: 'HOMEOSTASIS_REVISION_CONFLICT' });
}

async function insertRevision(db, input) {
  let row = await db.get(`SELECT * FROM homeostasis_contract_revisions
    WHERE mission_id = ? AND contract_hash = ?`, input.missionId, input.hash);
  if (!row) {
    const latest = await db.get('SELECT MAX(revision) AS revision FROM homeostasis_contract_revisions WHERE mission_id = ?', input.missionId);
    const revision = Number(latest?.revision || 0) + 1;
    row = { revision, contract_hash: input.hash, contract_json: JSON.stringify(input.payload) };
    await db.run(`INSERT INTO homeostasis_contract_revisions (id, mission_id, revision, contract_hash, contract_json)
      VALUES (?, ?, ?, ?, ?)`, `${input.missionId}:${revision}`, input.missionId, revision, input.hash, row.contract_json);
  }
  return loadRow(row);
}

module.exports = { active, resolve, loadRow };
