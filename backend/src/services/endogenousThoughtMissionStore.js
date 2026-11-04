'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');
const ledger = require('./gvxLedgerIntegrity');
const contract = require('./endogenousThoughtMissionContract');

async function ensure(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS endogenous_thought_mission_bindings (
    id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,project_id TEXT NOT NULL,
    mission_id TEXT NOT NULL,agent_id TEXT NOT NULL,body_json TEXT NOT NULL,body_mac TEXT NOT NULL);`);
}
function mac(body) {
  ledger.assertSigningKeyConfigured();
  return ledger.macEvent(contract.digest(body));
}
function authentic(body, signature) {
  if (!/^[a-f0-9]{64}$/.test(signature || '')) return false;
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(mac(body), 'hex'));
}
async function put(db, body) {
  await ensure(db);
  const signature = mac(body), serialized = canonicalJson(body);
  await db.run(`INSERT OR IGNORE INTO endogenous_thought_mission_bindings
    (id,organization_id,project_id,mission_id,agent_id,body_json,body_mac) VALUES(?,?,?,?,?,?,?)`,
  body.receiptId, body.organizationId, body.projectId, body.missionId, body.agentId, serialized, signature);
  const row = await db.get('SELECT body_json,body_mac FROM endogenous_thought_mission_bindings WHERE id=?', body.receiptId);
  if (row.body_json !== serialized || row.body_mac !== signature) throw contract.fail('ETT_MISSION_BINDING_CONFLICT');
  return { ...body, signature };
}
async function get(db, input) {
  await ensure(db);
  const row = await db.get(`SELECT * FROM endogenous_thought_mission_bindings WHERE id=?
    AND organization_id=? AND project_id=? AND mission_id=? AND agent_id=?`,
  input.receiptId, input.organizationId, input.projectId, input.missionId, input.agentId);
  if (!row) throw contract.fail('ETT_MISSION_BINDING_NOT_FOUND');
  const body = JSON.parse(row.body_json);
  if (!authentic(body, row.body_mac)) throw contract.fail('ETT_MISSION_BINDING_INVALID');
  const identities = ['receiptId', 'organizationId', 'projectId', 'missionId', 'agentId'];
  if (!identities.every(key => body[key] === input[key])) throw contract.fail('ETT_MISSION_BINDING_SCOPE_CHANGED');
  return { ...body, signature: row.body_mac };
}

module.exports = { ensure, put, get, authentic };
