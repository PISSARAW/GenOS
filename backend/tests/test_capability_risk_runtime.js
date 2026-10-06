'use strict';
const assert = require('node:assert/strict');
const fixture = require('./capability_runtime_fixture');
const lineage = require('../src/services/morphogenesis/capabilities/riskLineage');
const ledger = require('../src/services/morphogenesis/capabilities/riskLedgerService');
const statistics = require('../src/services/morphogenesis/capabilities/statisticalProvenance');
const receipts = require('../src/services/morphogenesis/capabilities/statisticalReceipt');

async function samples(db, input) {
  const result = [];
  for (const evaluationUnitId of input.units) {
    const unitRef = await fixture.artifacts.put(db, { scopeId: input.scopeId, kind: 'statistical-evaluation-unit',
      content: { dataset: 'held-out-suite', caseId: evaluationUnitId } });
    const evidenceRef = await fixture.artifacts.put(db, { scopeId: input.scopeId, kind: 'paired-evaluation',
      content: { sampleId: `${input.prefix}:${evaluationUnitId}`, evaluationUnitId, unitRef,
        protocolHash: input.protocolHash, verifierId: 'verifier', environmentVersion: 'v1', outcome: 1 } });
    result.push({ evidenceRef });
  }
  return result;
}

async function run(db) {
  process.env.GENOS_STATISTICAL_RECEIPT_SECRET = 'test-only-capabilities-secret-32-characters';
  const scopeId = 'MISSION:risk';
  await lineage.createScope(db, { scopeId, nodeId: 'owner', topology: 'trinity', units: 50000000 });
  await assert.rejects(lineage.createScope(db, { scopeId, nodeId: 'reset', topology: 'biome', units: 50000000 }), /CANNOT_RESET/);
  const units = Array.from({ length: 30 }, (_, i) => `unit:${i}`);
  const protocol = { method: receipts.METHOD, nullConditionalWinProbability: 0.5,
    unitDefinition: 'one held-out paired execution', successPredicate: 'candidate passes; baseline fails',
    environmentVersion: 'v1', evaluationUnits: units };
  const beforeProtocol = await samples(db, { scopeId, units: [units[0]], protocolHash: fixture.artifacts.digest(protocol), prefix: 'before-protocol' });
  const registered = await statistics.registerProtocol(db, { scopeId, verifierId: 'verifier', protocol });
  await lineage.fork(db, { nodeId: 'owner', parentGrantId: `risk:${scopeId}`, children: [
    { nodeId: 'child', grantId: 'child-grant', topology: 'a_team', units: 20000000 } ] });
  const reservation = { nodeId: 'child', grantId: 'child-grant', testId: 'test',
    protocolHash: registered.protocolHash, evaluationSetId: 'held-out', ratio: 0.5 };
  const premature = await samples(db, { scopeId, units: [units[0]], protocolHash: registered.protocolHash, prefix: 'premature' });
  await assert.rejects(lineage.reserveNext(db, { ...reservation, scopeId: 'MISSION:alien' }), /SCOPE_MISMATCH/);
  await lineage.reserveNext(db, reservation);
  assert.equal((await lineage.reserveNext(db, reservation)).idempotent, true);
  await assert.rejects(lineage.reserveNext(db, { ...reservation, ratio: 0.9 }), /ALLOCATION_POLICY_CONFLICT/);
  await assert.rejects(lineage.reserveNext(db, { ...reservation, evaluationSetId: 'renamed' }), /ID_CONFLICT/);
  await assert.rejects(statistics.issueVerifiedReceipt(db, { scopeId, testId: 'test', verifierId: 'verifier', samples: premature }), /BEFORE_RESERVATION/);
  await lineage.reserveNext(db, { ...reservation, testId: 'another', evaluationSetId: 'other-set' });
  await assert.rejects(statistics.issueVerifiedReceipt(db, { scopeId, testId: 'test', verifierId: 'verifier', samples: beforeProtocol }), /BEFORE_PREREGISTRATION/);
  const evidence = await samples(db, { scopeId, units, protocolHash: registered.protocolHash, prefix: 'sample' });
  const assessment = { scopeId, testId: 'test', verifierId: 'verifier', samples: evidence };
  await assert.rejects(statistics.issueVerifiedReceipt(db, { ...assessment, samples: evidence.slice().reverse() }), /MANIFEST_PREFIX/);
  await assert.rejects(statistics.issueVerifiedReceipt(db, { ...assessment, verifierId: 'child' }), /BINDING|INDEPENDENT/);
  const receipt = await statistics.issueVerifiedReceipt(db, assessment);
  assert.equal(receipts.verify(receipt), true);
  assert.equal((await lineage.promotion(db, { nodeId: 'owner', contract: { testId: 'test', receipt } })).allowed, false);
  assert.equal((await lineage.promotion(db, { nodeId: 'child', contract: { testId: 'test', receipt } })).allowed, true);
  const balance = await ledger.grantBalance(db, 'child-grant');
  assert.equal(balance.conserved, true);
  assert.equal(balance.spent, 10000000);
  await lineage.lifecycle(db, { nodeId: 'child', action: 'ARCHIVED', revision: 0 });
  assert.equal((await lineage.promotion(db, { nodeId: 'child', contract: { testId: 'test', receipt } })).allowed, false);
  await lineage.lifecycle(db, { nodeId: 'child', action: 'ACTIVE', revision: 1 });
  assert.deepEqual(await ledger.grantBalance(db, 'child-grant'), balance);
  const aliases = await samples(db, { scopeId, units, protocolHash: registered.protocolHash, prefix: 'alias' });
  await assert.rejects(statistics.issueVerifiedReceipt(db, { ...assessment, testId: 'another', samples: aliases }), /UNIT_REUSE/);
  await assert.rejects(statistics.issueVerifiedReceipt(db, { ...assessment, testId: 'another' }), /SAMPLE_REUSE/);
  await lineage.merge(db, { nodeIds: ['owner', 'child'], newNodeId: 'merged', topology: 'holobionte' });
  assert.equal((await lineage.node(db, 'child')).state, 'MERGED');
  assert.equal((await ledger.grantBalance(db, 'child-grant')).conserved, true);
  await assert.rejects(db.run('DELETE FROM morph_statistical_protocols'), /immutable/);
  await allTopologyOwners(db);
}
module.exports = run;

async function allTopologyOwners(db) {
  for (const topology of lineage.TOPOLOGIES) {
    const nodeId = `topology-owner:${topology}`;
    await lineage.createScope(db, { scopeId: `MISSION:${nodeId}`, nodeId, topology, units: 100 });
    const missing = await lineage.promotion(db, { nodeId });
    assert.equal(missing.allowed, false);
    assert.equal(missing.reason, 'INHERITED_STATISTICAL_CONTRACT_REQUIRED');
  }
}
