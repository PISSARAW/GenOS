'use strict';
const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const trust = require('../src/services/verifierTrustRegistry');
const implementations = require('../src/services/gvxVerifierControlPlaneRegistry');
const verifier = require('../src/services/gvxVerifierRegistry');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const ledger = require('../src/services/gvxDevelopmentLedger');
const gate = require('../src/services/consciousnessEvidence/indicatorPromotionGate');
const collector = require('../src/services/consciousnessEvidence/indicatorEvidenceCollector');
const report = require('../src/services/consciousnessEvidence/indicatorReportService');
async function main() {
  const id = 'consciousness-boundary-fixture-v1';
  const indicatorId = 'GWT-3';
  const contextHash = 'c'.repeat(64);
  const scope = { organizationId: 'fixture-org', projectId: 'fixture-project', entityId: 'fixture-agent' };
  const requirements = gate.REQUIREMENTS.operational.map((kind) => 'consciousness:' + indicatorId + ':' + kind);
  trust.registerVerifier({ id, type: 'benchmark', digest: trust.computeVerifierDigest(id, 'fixture-v1') });
  implementations.registerVerifierImplementation({ id, requirements,
    verify: async ({ artifact, requirement }) => {
      const bound = JSON.parse(artifact);
      return { verified: requirement === 'consciousness:' + bound.indicatorId + ':' + bound.requirementKind,
        evidenceClass: 'consciousness_indicator_verification', businessDecision: bound };
    } });
  const verifierRegistry = verifier.fromTrustedRegistry([id]);
  const artifacts = new Map();
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateGvxLedger(db);
    for (const requirementKind of gate.REQUIREMENTS.operational) {
      const artifact = Buffer.from(JSON.stringify({ indicatorId, requirementKind, scope, contextHash, eligible: true }));
      const artifactRef = 'fixture://' + requirementKind;
      artifacts.set(artifactRef, artifact);
      await ledger.appendEvent(db, { ...scope, type: 'evidence_attached', payload: {
        kind: 'consciousness_indicator_evidence', indicatorId, requirementKind,
        evidence: { verifierId: id, artifactRef, artifactHash: verifier.digest(artifact) }
      } });
    }
    const options = { db, scope, indicatorId, contextHash, verifierRegistry,
      artifactReader: async ({ artifactRef }) => artifacts.get(artifactRef) };
    const collected = await collector.collect(options);
    assert.equal(collected.receipts.length, 5);
    assert.equal(collected.highestStage, 'operational');
    assert.equal(gate.evaluate({ indicatorId, scope, contextHash, receipts: collected.receipts }).promotionAllowed, true);
    assert.equal(gate.evaluate({ indicatorId, scope, contextHash: 'd'.repeat(64), receipts: collected.receipts }).promotionAllowed, false);
    assert.equal(gate.evaluate({ indicatorId: 'OTHER', scope, receipts: collected.receipts }).promotionAllowed, false);
    assert.equal(gate.evaluate({ indicatorId, scope: { ...scope, projectId: 'other' }, receipts: collected.receipts }).promotionAllowed, false);
    assert.equal(gate.validReceipts(JSON.parse(JSON.stringify(collected.receipts))).length, 0);
    assert.equal(gate.validReceipts(collected.receipts.map((receipt) => ({ ...receipt }))).length, 0);
    assert.deepEqual((await report.report({ ...options, indicators: [indicatorId] })).claimsPromoted, [indicatorId]);
    artifacts.set('fixture://implementation', Buffer.from('{}'));
    assert.equal((await collector.collect(options)).receipts.length, 4);
    assert.deepEqual((await report.report({ ...options, verifierRegistry: undefined, indicators: [indicatorId] })).claimsPromoted, []);
  } finally { await db.close(); }
  console.log('Trusted fixture boundary: hashes, indicator/project identity and copied-receipt rejection passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
