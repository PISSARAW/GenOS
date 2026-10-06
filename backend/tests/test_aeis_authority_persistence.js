'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../src/db');
const state = require('../src/services/epistemic/epistemicAuthorityState');
const { createApoptosisAuthorityBridge } = require('../src/services/epistemic/epistemicApoptosisAuthorityBridge');
const authority = require('../src/services/agentAuthorityService');
const missionAuthority = require('../src/services/missionExecutionAuthority');
process.env.GENOS_ADMIN_PASSWORD ||= 'aeis-authority-persistence-test';

async function verifyEscalation(db) {
  const bridge = createApoptosisAuthorityBridge();
  await state.accumulate(db, { agentId: 'immune-agent', eventId: 'confirmed-failure', signals: [8] });
  const retry = await state.accumulate(db, { agentId: 'immune-agent', eventId: 'confirmed-failure', signals: [8] });
  assert.equal(retry.dissonance, 15);
  assert.equal(retry.recorded, false);
  await assert.rejects(authority.requireOrchestrator(db, 'immune-agent'), { code: 'AEIS_AUTHORITY_REVOKED' });
  await assert.rejects(authority.authorizeMission(db, { agentId: 'immune-agent' }), { code: 'AEIS_AUTHORITY_REVOKED' });
  await bridge.revokeAuthority(db, 'immune-agent', { level: 'quarantine' });
  const quarantined = await db.get('SELECT status, isolation_mode FROM agents WHERE id = ?', 'immune-agent');
  assert.equal(quarantined.status, 'blocked');
  assert.equal(quarantined.isolation_mode, 'Quarantine');
  await assert.rejects(missionAuthority.assertAgentCurrent(db, 'immune-agent'), { code: 'AEIS_AUTHORITY_REVOKED' });
  await db.run("INSERT INTO agents (id,name,role,status,execution_mode,parent_agent_id) VALUES ('immune-child','immune-child','worker','running','worker','immune-agent')");
  await assert.rejects(missionAuthority.assertAgentCurrent(db, 'immune-child'), { code: 'AEIS_AUTHORITY_REVOKED' });
  const dead = await bridge.applyEpistemicApoptosis(db, 'immune-agent', [20]);
  assert.equal(dead.ok, true);
  assert.equal(dead.dissonance, 50);
  assert.equal((await db.get('SELECT status FROM agents WHERE id = ?', 'immune-agent')).status, 'apoptosis');
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aeis-authority-'));
  const file = path.join(root, 'authority.db');
  try {
    let db = await getDatabase(file);
    for (const id of ['immune-agent', 'healthy-agent']) await db.run(
      "INSERT INTO agents (id,name,role,status,execution_mode) VALUES (?,?,'orchestrator','running','orchestrator')", id, id);
    const bridge = createApoptosisAuthorityBridge();
    assert.equal((await bridge.applyEpistemicApoptosis(db, 'immune-agent', [7])).reason, 'below_threshold');
    await closeDatabase();
    db = await getDatabase(file);
    assert.equal((await db.get('SELECT dissonance FROM aeis_agent_dissonance WHERE agent_id = ?', 'immune-agent')).dissonance, 7);
    await verifyEscalation(db);
    await closeDatabase();
    db = await getDatabase(file);
    const persisted = await db.get('SELECT * FROM aeis_agent_dissonance WHERE agent_id = ?', 'immune-agent');
    assert.equal(persisted.authority_level, 4);
    assert.equal(JSON.parse(persisted.autopsy_json).subject, 'immune-agent');
    await assert.rejects(missionAuthority.assertAgentCurrent(db, 'immune-agent'), { code: 'AEIS_AUTHORITY_REVOKED' });
    await authority.requireOrchestrator(db, 'healthy-agent');
    console.log('AEIS authority: restart, deduplication, dispatch restriction, quarantine and apoptosis: PASS');
  } finally {
    await closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
