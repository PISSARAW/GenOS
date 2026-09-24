'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const store = require('../src/services/holobionte/holobiontStore');
const rhizome = require('../src/services/holobionte/symbionts/rhizomeAdapter');

function rhizomeCandidate(kind = 'TOOL') {
  return {
    nodeId: 'node.read-database', kind, capabilities: ['database-read'], inputs: [], outputs: ['rows'],
    requirements: [], providers: [{ providerId: 'provider.db', kind: 'service', reference: 'db-reader' }],
    evidenceRequirements: ['schema-check'], state: 'DISCOVERED', reliability: 0.95, cost: 0.1,
    latency: 12, provenance: ['registry:internal']
  };
}

function gap() {
  return {
    needId: 'need.database-read', missingCapability: 'database-read',
    evidence: { evidenceId: 'gap-evidence:need.database-read:3', needId: 'need.database-read', graphVersion: 3, diagnosis: {} }
  };
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    const host = await store.createSession(db, {
      hostId: 'rhizome-host', scope: 'PERSISTENT', constitution: { hostId: 'rhizome-host' }
    });
    const input = {
      holobiontId: host.holobiontId, expectedSessionRevision: host.revision,
      gap: gap(), node: rhizomeCandidate(),
      proof: { kind: 'CAPABILITY_VERIFIED', evidenceId: 'proof:database-read', verifierDigest: 'trusted-digest',
        evidenceRefs: ['schema-check'], verifiedAt: '2026-09-24T12:00:00.000Z' },
      admissionPolicy: { trustedVerifierDigests: ['trusted-digest'], trustedProviderIds: ['provider.db'] }
    };
    const result = await rhizome.registerRhizomeCandidate(db, input);
    assert.strictEqual(result.candidate.kind, 'TOOL');
    assert.strictEqual(result.candidate.origin, 'RHIZOME');
    assert.strictEqual(result.candidate.availability.status, 'AVAILABLE');
    assert.strictEqual(result.status, 'CANDIDATE');
    assert.ok(result.candidate.evidenceRefs.includes(gap().evidence.evidenceId));
    const session = await store.getSession(db, host.holobiontId);
    assert.strictEqual(session.candidateSymbionts[0].status, 'CANDIDATE');
    await assert.rejects(() => rhizome.registerRhizomeCandidate(db, {
      ...input, expectedSessionRevision: session.revision,
      gap: { ...gap(), missingCapability: 'different-capability' }
    }), { code: 'HOLOBIONT_RHIZOME_GAP_INVALID' });
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont Rhizome integration tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont Rhizome integration tests failed:', error);
  process.exitCode = 1;
});
