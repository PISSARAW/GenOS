'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const { MorphParticipant } = require('../src/services/morphProtocol/participant');
const f = require('./helpers/morphParticipantFixture');

async function durableTransition(directory) {
  const options = { dbPath: path.join(directory, 'participant.sqlite') };
  let node = f.runtime(options);
  const plan = f.plan();
  const query = f.query(plan);
  try {
    await node.bootstrap({ scope: f.scope, version: 1 }, plan.sourceSnapshot);
    const action = f.action();
    assert.equal((await node.act(action)).status, 'applied');
    assert.deepEqual(await node.act(action), { status: 'applied', operationId: action.operationId, version: 1 });
    const before = await node.canVerify(f.verification());
    assert.equal(before.allowed, false);
    assert.equal(before.independentGroups, 1);
    await node.quiesce(f.request(plan));
    await assert.rejects(node.act(f.action({ operationId: 'during-quiescence' })), /quiesced/);
    node.close();
    node = f.runtime(options);
    assert.equal(node.status({ scope: f.scope }).phase, 'quiesced');
    const ready = await node.prepare(f.request(plan));
    assert.equal(ready.status, 'ready');
    assert.deepEqual(await node.prepare(f.request(plan)), ready);
    assert.deepEqual(node.readyReceipt(query), ready);
    await assert.rejects(node.act(f.action({ operationId: 'during-prepared' })), /quiesced/);
    const applied = await node.commit(query);
    assert.equal(applied.status, 'applied');
    node.close();
    node = f.runtime(options);
    assert.deepEqual(await node.commit(query), applied);
    assert.equal(node.status({ scope: f.scope }).version, 2);
    assert.deepEqual(node.status({ scope: f.scope }).snapshot, plan.targetSnapshot);
    assert.deepEqual(node.receipt(query), applied);
    await assert.rejects(node.act(f.action({ operationId: 'stale-source' })), /stale organization/);
    assert.equal((await node.act(f.action({ operationId: 'target', version: 2 }))).status, 'applied');
    const after = await node.canVerify(f.verification());
    assert.equal(after.allowed, false);
    assert.equal(after.independentGroups, before.independentGroups);
    assert.equal(after.statisticalIndependence, 'not_established');
    const message = { scope: f.scope, reader: f.actor('agent-b'), messageId: 'confidential-1' };
    assert.equal((await node.readMessage(message)).messageId, 'confidential-1');
    await assert.rejects(node.readMessage({ ...message, reader: f.actor('agent-d') }), /frozen message audience denied/);
    await assert.rejects(node.readMessage({ ...message, reader: f.actor('agent-a') }), /current member/);
    await assert.rejects(node.bootstrap({ scope: f.scope, version: 1 }, plan.sourceSnapshot), /already bootstrapped/);
    await assert.rejects(node.quiesce(f.request(plan)), /already resolved/);
    const reuse = structuredClone(plan);
    reuse.sourceVersion = 2; reuse.targetVersion = 3;
    reuse.sourceSnapshot = structuredClone(plan.targetSnapshot);
    reuse.targetSnapshot = structuredClone(plan.targetSnapshot);
    reuse.transfers = [];
    await assert.rejects(node.prepare(f.request(reuse)), /idempotency conflict/);
  } finally { node.close(); }
  assert.throws(() => f.runtime({ ...options, participantId: f.actor('another-node') }), /belongs to another identity/);
}

async function decisionAndCheckpoint() {
  const plan = f.plan();
  const query = f.query(plan);
  const unknown = f.runtime({ verifyDecision: async () => null });
  try {
    await unknown.bootstrap({ scope: f.scope, version: 1 }, plan.sourceSnapshot);
    await unknown.prepare(f.request(plan));
    await assert.rejects(unknown.abort(query), /decision unknown; recovery required/);
    assert.equal(unknown.status({ scope: f.scope }).phase, 'prepared');
  } finally { unknown.close(); }
  const aborted = f.runtime({ verifyDecision: async value => f.decision(value, 'ABORT') });
  try {
    await aborted.bootstrap({ scope: f.scope, version: 1 }, plan.sourceSnapshot);
    await aborted.quiesce(f.request(plan));
    await assert.rejects(aborted.commit(query), /irreversible decision disagrees/);
    const result = await aborted.abort(query);
    assert.equal(result.status, 'aborted');
    assert.deepEqual(await aborted.abort(query), result);
    assert.equal(aborted.status({ scope: f.scope }).version, 1);
    assert.equal(aborted.status({ scope: f.scope }).phase, 'active');
    await assert.rejects(aborted.prepare(f.request(plan)), /already resolved/);
  } finally { aborted.close(); }
  const invalid = f.runtime({ verifyCheckpoint: async value => ({ ...f.checkpoint(value), requestDigest: digest('foreign') }) });
  try {
    await invalid.bootstrap({ scope: f.scope, version: 1 }, plan.sourceSnapshot);
    await assert.rejects(invalid.prepare(f.request(plan)), /checkpoint binding rejected/);
    assert.equal(invalid.status({ scope: f.scope }).phase, 'quiesced');
  } finally { invalid.close(); }
}

async function atomicApply() {
  const node = f.runtime();
  const plan = f.plan();
  try {
    await node.bootstrap({ scope: f.scope, version: 1 }, plan.sourceSnapshot);
    await node.prepare(f.request(plan));
    node.store.db.exec(`CREATE TEMP TRIGGER reject_receipt BEFORE INSERT ON morph_participant_receipts
      BEGIN SELECT RAISE(ABORT, 'injected receipt failure'); END;`);
    await assert.rejects(node.commit(f.query(plan)), /injected receipt failure/);
    assert.equal(node.status({ scope: f.scope }).version, 1);
    assert.equal(node.status({ scope: f.scope }).phase, 'prepared');
    assert.deepEqual(node.status({ scope: f.scope }).snapshot, plan.sourceSnapshot);
    assert.equal(node.receipt(f.query(plan)).status, 'ready');
    await assert.rejects(node.abort(f.query(plan)), /irreversible decision disagrees/);
    node.store.db.exec('DROP TRIGGER reject_receipt');
    await node.commit(f.query(plan));
    assert.equal(node.status({ scope: f.scope }).version, 2);
  } finally { node.close(); }
}

async function bindingAndAuthority() {
  assert.throws(() => new MorphParticipant({}), /callback required/);
  const denied = f.runtime({ authorize: async () => false });
  try { await assert.rejects(denied.bootstrap({ scope: f.scope, version: 1 }, f.plan().sourceSnapshot), /authorization rejected/); }
  finally { denied.close(); }
  const node = f.runtime();
  try {
    const plan = f.plan();
    await node.bootstrap({ scope: f.scope, version: 1 }, plan.sourceSnapshot);
    const forged = f.request(plan);
    forged.checkpointDigest = digest('stale-checkpoint');
    await assert.rejects(node.prepare(forged), /plan binding mismatch/);
    const stale = f.plan();
    stale.sourceVersion = 2; stale.targetVersion = 3;
    await assert.rejects(node.prepare(f.request(stale)), /stale source snapshot/);
    await node.quiesce(f.request(plan));
    const foreign = { ...f.request(plan), missionId: 'foreign' };
    await assert.rejects(node.quiesce(foreign), /idempotency conflict/);
  } finally { node.close(); }
}

async function run() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'morph-participant-'));
  try {
    await durableTransition(directory);
    await decisionAndCheckpoint();
    await atomicApply();
    await bindingAndAuthority();
    console.log('MORPH participant quiescence, transactional apply, durable recovery and audience/provenance retention: PASS');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
