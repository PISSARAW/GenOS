'use strict';
const assert = require('node:assert/strict');
const { openDatabase, authoritySchema } = require('./helpers/biologyDatabase');
const { buildHomeostasisContract, serializeContract, deserializeContract, evaluateContract,
  homeostasisStatus } = require('../src/services/homeostasisContractService');
const authority = require('../src/services/homeostasisAuthorityStore');

function declared(flag) {
  return buildHomeostasisContract({ id: 'contract', missionId: 'mission', requiredEvidence: ['proof'],
    invariants: [{ id: 'works', kind: 'functional', verifier: { type: 'context.flag', flag } }] });
}

async function revisions(db) {
  const first = await authority.resolve(db, { missionId: 'mission', proposed: () => declared('works'), explicit: true });
  assert.equal(first.revision, 1);
  const replay = await authority.resolve(db, { missionId: 'mission', proposed: () => { throw new Error('fallback forbidden'); } });
  assert.equal(replay.contractHash, first.contractHash);
  assert.equal(replay.assembledAt, first.assembledAt);
  await assert.rejects(authority.resolve(db, { missionId: 'mission', explicit: true,
    proposed: () => declared('other') }), { code: 'HOMEOSTASIS_REVISION_CONFLICT' });
  const attempts = await Promise.allSettled([0, 1].map(() => authority.resolve(db, {
    missionId: 'mission', explicit: true, expectedRevision: 1, proposed: () => declared('other') })));
  assert.equal(attempts.filter(item => item.status === 'fulfilled').length, 2, 'identical retries are idempotent');
  assert.equal((await authority.active(db, 'mission')).revision, 2);
  await assert.rejects(db.run('UPDATE homeostasis_contract_revisions SET contract_hash = ?', 'tampered'), /Immutable/);
  await assert.rejects(db.run('DELETE FROM homeostasis_contract_revisions'), /Immutable/);
}

async function declarations(db) {
  await assert.rejects(authority.resolve(db, { missionId: 'closure', explicit: true,
    proposed: () => buildHomeostasisContract({ missionId: 'closure', invariants: [{ check: () => true }] }) }), /Unknown verifier/);
  assert.equal((await db.get("SELECT COUNT(*) AS count FROM homeostasis_contract_revisions WHERE mission_id = 'closure'")).count, 0);
  assert.throws(() => authority.loadRow({ contract_json: JSON.stringify(serializeContract(declared('works'))),
    revision: 1, contract_hash: 'tampered' }), /integrity/);
  const restored = deserializeContract(serializeContract(declared('works')));
  assert.equal(evaluateContract(restored, { flags: { works: true } }).homeostasisSatisfied, false);
  assert.equal(evaluateContract(restored, { flags: { works: true }, evidence: ['proof'] }).homeostasisSatisfied, true);
}

function thresholds() {
  const source = { missionId: 'mission', minimumFunctionalCoverage: 0.5, invariants: [
    { id: 'one', verifier: { type: 'context.flag', flag: 'one' } },
    { id: 'two', verifier: { type: 'context.flag', flag: 'two' } },
    { id: 'safe', kind: 'safety', verifier: { type: 'context.flag', flag: 'safe' } }
  ] };
  const ctx = { flags: { one: true, safe: true } };
  assert.equal(evaluateContract(buildHomeostasisContract(source), ctx).homeostasisSatisfied, true);
  assert.equal(evaluateContract(buildHomeostasisContract({ ...source, policyVersion: 'genos.homeostasis-policy/v1' }), ctx).homeostasisSatisfied, false);
  assert.equal(homeostasisStatus(evaluateContract(buildHomeostasisContract(source), { flags: { one: true } })), 'unsafe');
  assert.throws(() => buildHomeostasisContract({ ...source, classCoverage: { safety: 0.5 } }), /Safety/);
  assert.throws(() => buildHomeostasisContract({ ...source, policyVersion: 'future' }), /Unsupported/);
  assert.equal(evaluateContract(buildHomeostasisContract({ invariants: [] }), {}).homeostasisSatisfied, false);
}

async function main() {
  const db = openDatabase();
  try { await authoritySchema(db); await revisions(db); await declarations(db); thresholds(); }
  finally { await db.close(); }
  console.log('Durable authority, idempotency, immutable revisions and coverage policy passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
