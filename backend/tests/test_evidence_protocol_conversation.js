'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const { EvidenceConversation } = require('../src/services/evidenceProtocol/conversation');
const fixture = require('./helpers/evidenceProtocolFixture');

async function durable() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-conversation-'));
  const options = { dbPath: path.join(directory, 'runtime.db') };
  let runtime = fixture.conversation(options);
  try {
    const value = fixture.claim();
    const assertion = fixture.message('ASSERT', { claim: value });
    const first = await runtime.apply(assertion);
    assert.deepEqual(await runtime.apply(assertion), first);
    assert.equal(runtime.history().length, 1);
    await assert.rejects(runtime.apply({ ...assertion, operationId: 'conflict' }), /idempotency conflict/);
    await assert.rejects(runtime.apply(fixture.message('VERIFY', { claimId: 'root' },
      { causalRefs: [assertion.messageId] })), /out of order/);
    await assert.rejects(runtime.apply(fixture.message('REQUEST_EVIDENCE', { claimId: 'root' })), /causal reference/);
    let previous = assertion;
    for (const type of ['REQUEST_EVIDENCE', 'VERIFY', 'ACCEPT_UNDER_POLICY']) {
      const next = fixture.message(type, { claimId: 'root' }, { causalRefs: [previous.messageId] });
      await runtime.apply(next);
      previous = next;
    }
    runtime.close();
    runtime = fixture.conversation(options);
    assert.equal(runtime.history().length, 4);
    assert.equal(runtime.claim('root').status, 'accepted');
    assert.equal(runtime.canPromote(fixture.promotion(value)), true);
    const stale = fixture.promotion(value);
    stale.subject = { ...value.subject, baseDigest: digest('new-base') };
    assert.equal(runtime.canPromote(stale), false);
    assert.equal(runtime.canPromote({ ...fixture.promotion(value), generations: { incarnation: 1, organization: 1, workspace: 2 } }), false);
    assert.deepEqual(await runtime.apply(previous), runtime.history()[3].result);
  } finally { runtime.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

async function rejectedReceipts() {
  assert.throws(() => new EvidenceConversation({}), /callback required/);
  const runtime = fixture.conversation({ verifyEvidence: async ({ claim }) => ({ ...fixture.receipt(claim),
    claimDigest: digest('different-claim') }) });
  try {
    const value = fixture.claim();
    const assertion = fixture.message('ASSERT', { claim: value });
    await runtime.apply(assertion);
    const request = fixture.message('REQUEST_EVIDENCE', { claimId: 'root' }, { causalRefs: [assertion.messageId] });
    await runtime.apply(request);
    await assert.rejects(runtime.apply(fixture.message('VERIFY', { claimId: 'root' },
      { causalRefs: [request.messageId] })), /receipt mismatch/);
    assert.equal(runtime.claim('root').status, 'evidence_requested');
    assert.equal(runtime.history().length, 2);
  } finally { runtime.close(); }
}

async function authorityAndPolicy() {
  const denied = fixture.conversation({ authorize: async () => false });
  try { await assert.rejects(denied.apply(fixture.message('ASSERT', { claim: fixture.claim() })), /authority rejected/); }
  finally { denied.close(); }
  const runtime = fixture.conversation({ acceptPolicy: async () => false });
  try {
    await assert.rejects(fixture.accept(runtime, fixture.claim()), /policy rejected/);
    assert.equal(runtime.claim('root').status, 'verified');
    assert.equal(runtime.canPromote(fixture.promotion(fixture.claim())), false);
    await assert.rejects(runtime.apply(fixture.message('CHALLENGE', { claimId: 'root' },
      { scope: { organizationId: 'foreign', projectId: 'project:1' } })), /context mismatch/);
  } finally { runtime.close(); }
}

async function main() {
  await durable();
  await rejectedReceipts();
  await authorityAndPolicy();
  console.log('EVIDENCE durable conversation passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
