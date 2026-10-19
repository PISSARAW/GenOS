'use strict';

const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const fixture = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const observationService = require('../src/services/shev/observationService');
const { compilePending } = require('../src/services/shev/initiativeService');

const observer = generateKeyPairSync('ed25519');
const publicKey = observer.publicKey.export({ type: 'spki', format: 'pem' });
const mandate = { purpose: 'Surveiller le projet', autoDiagnose: true, autoInstrument: false,
  dimensions: [{ name: 'delivery', expected: 'Livraison saine', acceptance: ['Le test est vert.'] }],
  endogenousPolicy: { enabled: true, observerKeyId: 'probe-ci', observerPublicKey: publicKey,
    cooldownMs: 60000, windowMs: 3600000, maxActionsPerWindow: 2 } };

function observation(id) {
  return { id, projectId: 'endogenous-a', domain: 'ci', dimension: 'delivery', kind: 'degradation',
    epistemicStatus: 'observed', source: 'probe:ci', observedAt: '2026-10-19T08:00:00.000Z',
    validUntil: '2026-10-20T08:00:00.000Z', summary: 'Regression observee',
    evidenceRefs: [`artifact:${id}`] };
}

function at(id, observedAt) {
  const input = { ...observation(id), observedAt,
    validUntil: '2026-10-21T08:00:00.000Z' };
  return { ...input, attestation: attestation(input) };
}

function attestation(input) {
  const normalized = observationService.normalizedObservation(input);
  const signature = sign(null, Buffer.from(observationService.observationPayload(normalized)),
    observer.privateKey).toString('base64');
  return { keyId: 'probe-ci', signature };
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    await store.createProject(db, { id: 'endogenous-a', rootPath: 'C:/test',
      branch: 'codex/endogenous', objective: 'surveiller', config: fixture.testConfig() });
    await registerResponsibility(db, { projectId: 'endogenous-a', authorityRef: 'owner', mandate });
    const first = observation('signed-1');
    await assert.rejects(observationService.recordObservation(db, first), /observer signature/);
    await assert.rejects(observationService.recordObservation(db, { ...first,
      attestation: { keyId: 'probe-ci', signature: Buffer.alloc(64).toString('base64') } }), /signature is invalid/);
    await observationService.recordObservation(db, { ...first, attestation: attestation(first) });
    const stored = await db.get('SELECT * FROM shev_observation_attestations WHERE observation_id = ?', [first.id]);
    assert.equal(stored.key_id, 'probe-ci');
    assert.equal(stored.payload_hash.length, 64);
    await assert.rejects(db.run("UPDATE shev_observation_attestations SET key_id = 'other'"), /immutable/);
    await db.run("UPDATE ontogenesis_projects SET state = 'IDLE' WHERE id = 'endogenous-a'");
    const base = Date.parse('2026-10-19T09:00:00.000Z');
    await compilePending(db, { projectId: 'endogenous-a', nowMs: base });
    await observationService.recordObservation(db, at('signed-cooldown', '2026-10-19T09:00:30.000Z'));
    await compilePending(db, { projectId: 'endogenous-a', nowMs: base + 30000 });
    await observationService.recordObservation(db, at('signed-2', '2026-10-19T09:01:01.000Z'));
    await compilePending(db, { projectId: 'endogenous-a', nowMs: base + 61000 });
    await observationService.recordObservation(db, at('signed-3', '2026-10-19T09:02:02.000Z'));
    await compilePending(db, { projectId: 'endogenous-a', nowMs: base + 122000 });
    const decisions = await db.all(`SELECT observation_id, decision, reason
      FROM shev_endogenous_arbitrations ORDER BY decided_at`);
    assert.deepEqual(decisions.map((item) => item.decision), ['ACT', 'NO_CHANGE', 'ACT', 'NO_CHANGE']);
    assert.equal(decisions[1].reason, 'cooldown-actif');
    assert.equal(decisions[3].reason, 'budget-actions-epuise');
    assert.equal((await db.get("SELECT COUNT(*) AS n FROM shev_initiatives WHERE status = 'queued'")).n, 2);
    assert.equal((await db.get("SELECT COUNT(*) AS n FROM shev_initiatives WHERE status = 'rejected'")).n, 2);
    assert.equal((await db.get("SELECT COUNT(*) AS n FROM ontogenesis_events WHERE type = 'wake' AND consumed = 0")).n, 1);
    await assert.rejects(db.run("DELETE FROM shev_endogenous_arbitrations"), /immutable/);
    console.log('SHEV signed endogenous arbitration checks passed.');
  } finally { await db.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
