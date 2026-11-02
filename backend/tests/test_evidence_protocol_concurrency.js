'use strict';

const assert = require('node:assert/strict');
const fixture = require('./helpers/evidenceProtocolFixture');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function prepared(runtime) {
  const assertion = fixture.message('ASSERT', { claim: fixture.claim() });
  await runtime.apply(assertion);
  const request = fixture.message('REQUEST_EVIDENCE', { claimId: 'root' }, { causalRefs: [assertion.messageId] });
  await runtime.apply(request);
  return fixture.message('VERIFY', { claimId: 'root' }, { causalRefs: [request.messageId] });
}

async function concurrentMutation() {
  const entered = deferred();
  const release = deferred();
  const runtime = fixture.conversation({ verifyEvidence: async ({ claim }) => {
    assert.throws(() => { claim.subject.baseDigest = 'mutation'; }, TypeError);
    entered.resolve();
    await release.promise;
    return fixture.receipt(claim);
  } });
  try {
    const verification = await prepared(runtime);
    const pending = runtime.apply(verification);
    await entered.promise;
    await runtime.apply(fixture.message('ASSERT', { claim: fixture.claim({ claimId: 'concurrent' }) }));
    release.resolve();
    await assert.rejects(pending, /state changed during verification/);
    assert.equal(runtime.claim('root').status, 'evidence_requested');
    assert.equal(runtime.history().length, 3);
  } finally { release.resolve(); runtime.close(); }
}

async function expiryDuringVerification() {
  let now = fixture.NOW;
  const runtime = fixture.conversation({ clock: () => now, verifyEvidence: async ({ claim }) => {
    now = '2026-11-04T10:00:00.000Z';
    return fixture.receipt(claim);
  } });
  try {
    const verification = await prepared(runtime);
    await assert.rejects(runtime.apply(verification), /expired/);
    assert.equal(runtime.claim('root').status, 'evidence_requested');
    assert.equal(runtime.history().length, 2);
  } finally { runtime.close(); }
}

async function trustAndScope() {
  const runtime = fixture.conversation({ authorize: async (message) => message.sender.trustDomain === 'local' });
  try {
    const value = fixture.claim();
    await fixture.accept(runtime, value);
    const foreign = fixture.message('ASSERT', { claim: fixture.claim({ claimId: 'foreign' }) },
      { sender: { agentId: 'producer', incarnationId: 'incarnation:1', trustDomain: 'foreign' } });
    await assert.rejects(runtime.apply(foreign), /authority rejected/);
    const request = fixture.promotion(value);
    assert.equal(runtime.canPromote({ ...request, scope: { organizationId: 'foreign', projectId: 'project:1' } }), false);
    assert.equal(runtime.canPromote({ ...request, conversationId: 'foreign' }), false);
    assert.equal(runtime.canPromote({ ...request, missionId: 'foreign' }), false);
    const missingScope = { ...request };
    delete missingScope.scope;
    assert.equal(runtime.canPromote(missingScope), false);
    const foreignDependency = fixture.claim({ claimId: 'dependent', dependencies: ['root'] });
    await assert.rejects(runtime.apply(fixture.message('ASSERT', { claim: foreignDependency },
      { scope: { organizationId: 'foreign', projectId: 'project:1' } })), /foreign dependency/);
  } finally { runtime.close(); }
}

async function revokedDuringVerification() {
  let granted = true;
  const runtime = fixture.conversation({ authorize: async () => granted, verifyEvidence: async ({ claim }) => {
    granted = false;
    return fixture.receipt(claim);
  } });
  try {
    const verification = await prepared(runtime);
    await assert.rejects(runtime.apply(verification), /authority revoked/);
    assert.equal(runtime.claim('root').status, 'evidence_requested');
    assert.equal(runtime.history().length, 2);
  } finally { runtime.close(); }
}

async function revokedDuringAcceptance() {
  let granted = true;
  const runtime = fixture.conversation({ authorize: async () => granted,
    acceptPolicy: async () => { granted = false; return true; } });
  try {
    await assert.rejects(fixture.accept(runtime, fixture.claim()), /authority revoked/);
    assert.equal(runtime.claim('root').status, 'verified');
    assert.equal(runtime.history().length, 3);
  } finally { runtime.close(); }
}

async function main() {
  await concurrentMutation();
  await expiryDuringVerification();
  await trustAndScope();
  await revokedDuringVerification();
  await revokedDuringAcceptance();
  console.log('EVIDENCE concurrent verification, expiry and trust boundaries passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
