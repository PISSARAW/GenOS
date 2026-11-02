'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const { DIMENSIONS } = require('../src/services/synapseProtocol/ackValidation');
const grounding = require('../src/services/communication/groundingService');
const f = require('./helpers/synapseAckFixture');
const conversation = require('./helpers/synapseConversationFixture');

async function orthogonalFacts(directory) {
  const options = { dbPath: path.join(directory, 'acks.sqlite') };
  let setup = f.setup(options);
  const human = f.message('human_authorized');
  try {
    const approved = await setup.ledger.apply(human);
    assert.equal(approved.dimension, 'human_authorized');
    assert.equal(approved.qualification.humanId, 'fixture-human-only');
    let facts = await setup.ledger.facts(f.QUERY);
    assert.equal(facts.dimensions.human_authorized.established, true);
    assert.equal(facts.dimensions.independently_verified.established, false);
    assert.equal(facts.dimensions.action_observed.established, false);
    assert.equal(facts.dimensions.state_applied.established, false);
    assert.equal(facts.dimensions.transport_received.established, false);
    assert.equal(setup.calls.verified, 0);
    assert.equal(setup.calls.action, 0);
    const verified = await setup.ledger.apply(f.message('independently_verified'));
    assert.equal(verified.status, 'established');
    assert.equal(verified.verificationContext.environmentDigest, f.QUALIFICATION.environmentDigest);
    assert.equal(verified.qualification.independence.statisticalIndependence, 'not_established');
    assert.equal(verified.qualification.independence.provenance, false);
    facts = await setup.ledger.facts(f.QUERY);
    assert.equal(facts.dimensions.independently_verified.established, true);
    assert.equal(facts.dimensions.decoded.established, false);
    assert.deepEqual(facts.implicationRules, []);
    assert.equal(facts.currentApplicability, 'not_evaluated');
    assert.equal(facts.externalActionsAuthorized, false);
    assert.deepEqual(await setup.ledger.apply(human), approved);
    assert.equal(setup.calls.human, 1);
    setup.ledger.close(); setup = f.setup(options);
    assert.deepEqual(await setup.ledger.apply(human), approved);
    assert.equal(setup.calls.human, 0);
    assert.equal((await setup.ledger.facts(f.QUERY)).dimensions.human_authorized.established, true);
    await assert.rejects(setup.ledger.apply({ ...human, operationId: 'conflict' }), /idempotency conflict/);
  } finally { setup.ledger.close(); }
}

async function separateObservations() {
  const setup = f.setup();
  try {
    await setup.ledger.apply(f.message('transport_received'));
    let facts = await setup.ledger.facts(f.QUERY);
    assert.equal(facts.dimensions.decoded.established, false);
    await setup.ledger.apply(f.message('decoded'));
    const action = f.message('action_observed');
    const unknown = await setup.ledger.apply(action);
    assert.equal(unknown.status, 'outcome_unknown');
    facts = await setup.ledger.facts(f.QUERY);
    assert.equal(facts.dimensions.action_observed.established, false);
    assert.equal(facts.dimensions.action_observed.outcomeUnknown, true);
    assert.equal(setup.calls.action, 1);
    assert.deepEqual(await setup.ledger.apply(action), unknown);
    assert.equal(setup.calls.action, 1);
    setup.observeActionNow();
    const binding = { ...f.QUERY, ackId: action.payload.ackId };
    assert.equal((await setup.ledger.reconcileAction(binding)).status, 'established');
    assert.equal(setup.calls.action, 2);
    assert.deepEqual(await setup.ledger.apply(action), unknown);
    const history = await setup.ledger.history(binding);
    assert.deepEqual(history.map(row => row.receipt.status), ['outcome_unknown', 'established']);
    facts = await setup.ledger.facts(f.QUERY);
    assert.equal(facts.dimensions.action_observed.established, true);
    assert.equal(facts.dimensions.independently_verified.established, false);
    assert.equal(facts.dimensions.state_applied.established, false);
  } finally { setup.ledger.close(); }
}

async function malformedBindings() {
  const setup = f.setup();
  try {
    const human = f.message('human_authorized');
    const missing = { ...human, payload: { ...human.payload, dimension: 'human_implies_verified' } };
    missing.payloadDigest = digest(missing.payload);
    await assert.rejects(setup.ledger.apply(missing), /contract/);
    const swapped = { ...human, sender: f.PUBLISHER, audience: f.RECEIVER };
    await assert.rejects(setup.ledger.apply(swapped), /sender or audience/);
    const corrupt = { ...human.payload, subjectDigest: digest('another-subject') };
    const candidate = f.message('human_authorized', { payload: corrupt });
    await assert.rejects(setup.ledger.apply(candidate), /subject digest mismatch/);
    await assert.rejects(setup.ledger.apply(f.message('state_applied')), /evidence source unavailable/);
    for (const dimension of DIMENSIONS) assert.equal((await setup.ledger.facts(f.QUERY)).dimensions[dimension].established, false);
  } finally { setup.ledger.close(); }
}

async function legacyLadderDoesNotQualify() {
  const setup = f.setup();
  try {
    const db = setup.ledger.store.db;
    await db.exec(`CREATE TABLE signal_deliveries (signal_id TEXT,subscriber_agent_id TEXT,status TEXT,
      delivered_at TEXT,seen_at TEXT,acked_at TEXT,PRIMARY KEY(signal_id,subscriber_agent_id));`);
    await grounding.recordSignalGrounding({ db, signalId: 'signal-1', subscriberAgentId: 'receiver', semanticHash: digest(f.SUBJECT) });
    const legacy = await grounding.ackHuman({ db, signalId: 'signal-1', subscriberAgentId: 'receiver', approverId: 'fixture-legacy-id' });
    assert.equal(legacy.groundingLevel, 'human_confirmation');
    setup.ledger.providers.set('human_authorized', async () => legacy);
    await assert.rejects(setup.ledger.apply(f.message('human_authorized')), /source proof is not bound/);
    assert.equal((await setup.ledger.facts(f.QUERY)).dimensions.human_authorized.established, false);
    assert.equal((await setup.ledger.facts(f.QUERY)).dimensions.independently_verified.established, false);
  } finally { setup.ledger.close(); }
}

async function actualCommittedStateReceipt() {
  const native = await conversation.setup();
  let setup;
  try {
    await conversation.offer(native);
    const subject = await native.receiver.subject(native.deltaQuery);
    setup = f.setup({ resolveSubject: query => native.receiver.subject(query),
      verifyApplied: request => native.receiver.receipt(request.query) });
    const { scope, missionId, conversationId, deltaId, deltaDigest } = native.deltaQuery;
    const message = f.message('state_applied', { scope, missionId, conversationId, sender: subject.receiver,
      audience: subject.context.publisher, payload: { ackId: 'native-state-ack', deltaId, deltaDigest,
        dimension: 'state_applied', subjectDigest: digest(subject), evidenceRef: 'runtime:committed-state' } });
    await assert.rejects(setup.ledger.apply(message), /appliedMessageId|identifier/);
    await conversation.apply(native);
    const source = await native.receiver.receipt(native.deltaQuery);
    const ack = await setup.ledger.apply(message);
    assert.equal(ack.sourceReceiptDigest, source.receiptDigest);
    assert.equal(ack.qualification.resultDigest, digest((await native.receiver.state(native.documentQuery)).value));
    const vector = (await setup.ledger.facts(native.deltaQuery)).dimensions;
    assert.equal(vector.state_applied.established, true);
    for (const dimension of DIMENSIONS.filter(value => value !== 'state_applied')) assert.equal(vector[dimension].established, false);
  } finally { setup?.ledger.close(); conversation.cleanup(native); }
}

async function run() {
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'synapse-ack-'));
  try {
    await orthogonalFacts(directory);
    await separateObservations();
    await malformedBindings();
    await legacyLadderDoesNotQualify();
    await actualCommittedStateReceipt();
    console.log('SYNAPSE orthogonal acknowledgement facts, separate human authority, scoped evidence and unknown observations: PASS');
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), temporaryRoot);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
