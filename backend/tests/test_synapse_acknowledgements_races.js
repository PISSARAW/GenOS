'use strict';

const assert = require('node:assert/strict');
const { withTransaction } = require('../src/db');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const f = require('./helpers/synapseAckFixture');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function changedVerificationContext() {
  let qualifier = f.QUALIFICATION;
  const setup = f.setup({ verificationContext: async request => {
    assert.deepEqual(request.query, f.QUERY);
    return qualifier;
  }, verifyEvidence: async request => {
    const receipt = f.independentVerification(request);
    qualifier = { ...qualifier, environmentDigest: digest('changed-checker-environment') };
    return receipt;
  } });
  try {
    await assert.rejects(setup.ledger.apply(f.message('independently_verified')), /verification environment or policy changed/);
    assert.equal((await setup.ledger.facts(f.QUERY)).dimensions.independently_verified.established, false);
  } finally { setup.ledger.close(); }
}

async function revokedDuringProof() {
  let granted = true;
  const setup = f.setup({ authorize: async ({ action }) => action !== 'ACK_FACT' || granted,
    verifyHumanApproval: async request => { granted = false; return f.humanApproval(request); } });
  try {
    await assert.rejects(setup.ledger.apply(f.message('human_authorized')), /authority rejected or revoked/);
    assert.equal((await setup.ledger.facts(f.QUERY)).receipts.length, 0);
  } finally { setup.ledger.close(); }
}

async function changedDuringFinalAuthorization() {
  let qualifier = f.QUALIFICATION;
  let admissions = 0;
  const setup = f.setup({ verificationContext: async () => qualifier, authorize: async ({ action }) => {
    if (action === 'ACK_FACT' && ++admissions === 2) {
      qualifier = { ...qualifier, environmentDigest: digest('final-authorization-environment') };
    }
    return true;
  } });
  try {
    await assert.rejects(setup.ledger.apply(f.message('independently_verified')), /verification environment or policy changed/);
    assert.equal((await setup.ledger.facts(f.QUERY)).receipts.length, 0);
  } finally { setup.ledger.close(); }
}

async function mutexBoundary(mode) {
  let granted = true;
  let now = f.NOW;
  const setup = f.setup({ authorize: async ({ action }) => action !== 'ACK_FACT' || granted, clock: () => now });
  const original = setup.ledger.store.commit.bind(setup.ledger.store);
  setup.ledger.store.commit = async change => {
    const entered = deferred();
    const release = deferred();
    const blocker = withTransaction(setup.ledger.store.db, async () => { entered.resolve(); await release.promise; });
    await entered.promise;
    const pending = original(change).then(value => ({ value }), error => ({ error }));
    if (mode === 'expiry') now = '2026-11-04T10:00:00Z';
    else granted = false;
    release.resolve(); await blocker;
    const result = await pending;
    if (result.error) throw result.error;
    return result.value;
  };
  try {
    await assert.rejects(setup.ledger.apply(f.message('human_authorized')), /expired|authority rejected or revoked/);
    assert.equal((await setup.ledger.facts(f.QUERY)).receipts.length, 0);
  } finally { setup.ledger.close(); }
}

async function realReceiptBindingRequired() {
  const bad = { status: 'applied', ...f.QUERY, contextId: f.CONTEXT.contextId, contextDigest: digest(f.CONTEXT),
    baseDigest: f.DELTA.baseDigest, resultDigest: digest('wrong-result'), previousGeneration: 0,
    generation: 1, appliedMessageId: 'applied-message', receiver: f.RECEIVER };
  const setup = f.setup({ verifyApplied: async () => ({ ...bad,
    receiptDigest: digest({ profile: 'genos.synapse.state-receipt/v1', ...bad }) }) });
  try {
    await assert.rejects(setup.ledger.apply(f.message('state_applied')), /exact durable runtime receipt/);
    assert.equal((await setup.ledger.facts(f.QUERY)).dimensions.state_applied.established, false);
  } finally { setup.ledger.close(); }
}

async function qualificationCannotBeLaundered() {
  const self = f.setup({ verifyEvidence: async request => ({ ...f.independentVerification(request), verifier: f.PUBLISHER }) });
  try {
    await assert.rejects(self.ledger.apply(f.message('independently_verified')), /producer cannot independently verify/);
  } finally { self.ledger.close(); }
  const human = f.setup({ verifyEvidence: async request => f.humanApproval(request) });
  try {
    await assert.rejects(human.ledger.apply(f.message('independently_verified')), /independent proof qualification mismatch/);
  } finally { human.ledger.close(); }
  const statistical = f.setup({ verifyEvidence: async request => ({ ...f.independentVerification(request),
    independence: { execution: true, provenance: true, method: true, statisticalIndependence: 'proven' } }) });
  try {
    await assert.rejects(statistical.ledger.apply(f.message('independently_verified')), /cannot claim unestablished independence/);
  } finally { statistical.ledger.close(); }
}

async function scopedIdempotencyAndAtomicReceipt() {
  const setup = f.setup();
  try {
    const one = f.message('human_authorized', { idempotencyKey: 'same-key', messageId: 'same-id' });
    const two = f.message('human_authorized', { idempotencyKey: 'same-key', messageId: 'same-id', missionId: 'another-mission' });
    await setup.ledger.apply(one); await setup.ledger.apply(two);
    assert.equal((await setup.ledger.facts(f.QUERY)).receipts.length, 1);
    assert.equal((await setup.ledger.facts({ ...f.QUERY, missionId: 'another-mission' })).receipts.length, 1);
    const message = f.message('transport_received');
    const [first, second] = await Promise.all([setup.ledger.apply(message), setup.ledger.apply(message)]);
    assert.deepEqual(first, second);
    assert.equal((await setup.ledger.history({ ...f.QUERY, ackId: message.payload.ackId })).length, 1);
    setup.ledger.store.raw.exec(`CREATE TEMP TRIGGER reject_ack BEFORE INSERT ON synapse_ack_messages
      BEGIN SELECT RAISE(ABORT,'injected ACK receipt failure'); END;`);
    const rejected = f.message('decoded');
    await assert.rejects(setup.ledger.apply(rejected), /injected ACK receipt failure/);
    assert.equal((await setup.ledger.facts(f.QUERY)).dimensions.decoded.established, false);
    assert.equal((await setup.ledger.history({ ...f.QUERY, ackId: rejected.payload.ackId })).length, 0);
  } finally { setup.ledger.close(); }
}

async function auditReadAfterMutex() {
  let granted = true;
  const setup = f.setup({ authorize: async ({ action }) => action !== 'RECONCILE_ACTION' || granted });
  const entered = deferred();
  const release = deferred();
  try {
    setup.observeActionNow();
    const message = f.message('action_observed');
    await setup.ledger.apply(message);
    const blocker = withTransaction(setup.ledger.store.db, async () => { entered.resolve(); await release.promise; });
    await entered.promise;
    const reading = setup.ledger.reconcileAction({ ...f.QUERY, ackId: message.payload.ackId });
    granted = false; release.resolve(); await blocker;
    await assert.rejects(reading, /authority rejected or revoked/);
  } finally { release.resolve(); setup.ledger.close(); }
}

async function main() {
  await changedVerificationContext();
  await changedDuringFinalAuthorization();
  await revokedDuringProof();
  await mutexBoundary('expiry');
  await mutexBoundary('authority');
  await realReceiptBindingRequired();
  await qualificationCannotBeLaundered();
  await scopedIdempotencyAndAtomicReceipt();
  await auditReadAfterMutex();
  console.log('SYNAPSE ACK callback races, policy/environment binding, independent facts and atomic receipts: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
