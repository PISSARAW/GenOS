'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const authority = require('../src/services/morphogenesis/morphogenesisProductionAuthority');

function fixture() {
  const pair = crypto.generateKeyPairSync('ed25519');
  const pem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const raw = pair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const keyId = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  return { pair, pem, keyId, trust: JSON.stringify({ [keyId]: raw.toString('hex') }) };
}

async function run() {
  const keys = fixture();
  const previous = { privateKey: process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM,
    trust: process.env.GENOS_CLI_AUTHORITY_TRUST_JSON };
  process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM = keys.pem;
  process.env.GENOS_CLI_AUTHORITY_TRUST_JSON = keys.trust;
  const plan = { id: 'authority-plan', missionId: 'mission-1', actions: [],
    targetOrganization: 'rhizome', expectedGain: 0.7, expectedRisk: 0.2,
    reason: 'verified-change' };
  const snapshot = { id: 'snapshot-1', hash: 'b'.repeat(64),
    planHash: authority.planSha256(plan) };
  const hysteresisState = { schema: 'genos.morphogenesis-hysteresis-state/v1',
    organizationId: 'org', projectId: 'project', missionId: 'mission-1',
    version: 2, budgetLeft: 0.8, lastCommitUnixMs: 1000 };
  try {
    const body = authority.request({ plan, snapshot, hysteresisState, missionId: 'mission-1',
      currentTopology: 'trinity', req: { user: { username: 'operator' },
        tenant: { organizationId: 'org', projectId: 'project' } } });
    const payload = JSON.stringify(body);
    assert.equal(body.transitionSnapshotId, snapshot.id);
    assert.equal(body.transitionPlanSha256, snapshot.planHash);
    assert.deepEqual(body.transitionPlan, plan);
    assert.deepEqual(body.hysteresisState, hysteresisState);
    const envelope = body.transitionAuthority;
    assert.equal(envelope.claims.key_id, keys.keyId);
    assert.equal(crypto.verify(null, authority.signingBytes(envelope.claims),
      keys.pair.publicKey, Buffer.from(envelope.signature, 'hex')), true);
    const response = { schemaVersion: 1,
      requestSha256: crypto.createHash('sha256').update(payload).digest('hex'),
      decision: 'APPLY', commitAuthorized: true, committed: false,
      hysteresisTransition: { schema: 'genos.morphogenesis-hysteresis-transition/v1',
        baseVersion: 2, nextVersion: 3, budgetLeft: 0.6 },
      governance: { allowed: true }, authority: {
        keyId: keys.keyId, principalId: 'operator', organizationId: 'org',
        projectId: 'project', missionId: 'mission-1', snapshotId: snapshot.id,
        snapshotSha256: snapshot.hash, planSha256: snapshot.planHash,
        expiresAtUnixMs: Date.now() + 20_000 } };
    const receipt = authority.verifyResponse(response, payload, { snapshot, hysteresisState });
    assert.equal(receipt.decision, 'APPLY');
    assert.equal(receipt.snapshotId, snapshot.id);
    assert.throws(() => authority.verifyResponse({ ...response,
      hysteresisTransition: { ...response.hysteresisTransition, budgetLeft: 0.9 } },
    payload, { snapshot, hysteresisState }),
    (error) => error.code === 'MORPHOGENESIS_RUST_AUTHORITY_REFUSED');
    assert.throws(() => authority.request({ plan, snapshot,
      hysteresisState: { ...hysteresisState, missionId: 'other-mission' },
      missionId: 'mission-1', currentTopology: 'trinity', req: { user: { username: 'operator' },
        tenant: { organizationId: 'org', projectId: 'project' } } }),
    (error) => error.code === 'MORPHOGENESIS_HYSTERESIS_STATE_INVALID');
    assert.throws(() => authority.request({ plan, snapshot, hysteresisState, missionId: 'mission-1',
      currentTopology: 'trinity', req: {} }),
    (error) => error.code === 'MORPHOGENESIS_AUTHORITY_IDENTITY_REQUIRED');
    console.log('morphogenesis production Ed25519 authority: PASS');
  } finally {
    if (previous.privateKey === undefined) delete process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM;
    else process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM = previous.privateKey;
    if (previous.trust === undefined) delete process.env.GENOS_CLI_AUTHORITY_TRUST_JSON;
    else process.env.GENOS_CLI_AUTHORITY_TRUST_JSON = previous.trust;
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
