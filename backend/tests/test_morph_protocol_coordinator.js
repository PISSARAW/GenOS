'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const bindings = require('../src/services/morphProtocol/coordinatorBindings');
const fixture = require('./helpers/morphCoordinatorFixture');

async function durableCommit() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'morph-coordinator-'));
  const options = { dbPath: path.join(directory, 'coordinator.db') };
  let runtime = fixture.runtime(options);
  try {
    await fixture.prepare(runtime);
    const query = bindings.query(runtime.state('transition-1'));
    assert.equal(runtime.decision(query), null);
    const commit = fixture.next(runtime, 'COMMIT');
    const result = await runtime.apply(commit);
    assert.equal(result.status, 'committed');
    const decision = runtime.decision(query);
    assert.equal(decision.decision, 'COMMIT');
    assert.equal(runtime.decision({ ...query, missionId: 'foreign' }), null);
    assert.equal(runtime.decision({ ...query, scope: { ...query.scope, projectId: 'foreign' } }), null);
    assert.equal(runtime.decision({ ...query, scope: { ...query.scope, projectId: '*' } }), null);
    const missingScope = { ...query };
    delete missingScope.scope;
    assert.equal(runtime.decision(missingScope), null);
    runtime.close();
    runtime = fixture.runtime(options);
    assert.deepEqual(runtime.decision(query), decision);
    assert.deepEqual(await runtime.apply(commit), result);
    await assert.rejects(runtime.apply({ ...commit, operationId: 'conflict' }), /idempotency conflict/);
    await assert.rejects(runtime.apply(fixture.next(runtime, 'ABORT')), /cannot abort irreversible/);
    await runtime.apply(fixture.next(runtime, 'RECOVERY_REQUIRED'));
    assert.deepEqual(runtime.decision(query), decision);
    await runtime.apply(fixture.next(runtime, 'FINALIZE'));
    assert.equal(runtime.state('transition-1').status, 'finalized');
    assert.equal(runtime.state('transition-1').appliedReceipts.length, 4);
  } finally { runtime.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

async function allParticipantsRequired() {
  const runtime = fixture.runtime();
  try {
    await fixture.prepare(runtime, 'prepared');
    const roster = runtime.state('transition-1').plan.participants;
    for (const participant of roster.slice(0, -1)) await runtime.apply(fixture.ready(runtime, participant));
    await assert.rejects(runtime.apply(fixture.next(runtime, 'COMMIT')), /every fixed participant/);
    const duplicate = fixture.ready(runtime, roster[0]);
    await runtime.apply(duplicate);
    assert.equal(Object.keys(runtime.state('transition-1').ready).length, 3);
    await assert.rejects(runtime.apply(fixture.ready(runtime, fixture.actor('foreign'))), /outside fixed roster/);
    await runtime.apply(fixture.ready(runtime, roster[3]));
    await runtime.apply(fixture.next(runtime, 'COMMIT'));
    assert.equal(runtime.state('transition-1').status, 'committed');
  } finally { runtime.close(); }
}

async function rejectionAndAbort() {
  for (const type of ['REJECT', 'ABORT']) {
    const runtime = fixture.runtime();
    try {
      await fixture.prepare(runtime, 'proposed');
      const query = bindings.query(runtime.state('transition-1'));
      await runtime.apply(fixture.next(runtime, type));
      assert.equal(runtime.decision(query).decision, 'ABORT');
      await assert.rejects(runtime.apply(fixture.next(runtime, 'QUIESCE')), /out of order/);
      await assert.rejects(runtime.apply(fixture.next(runtime, 'COMMIT')), /every fixed participant/);
      assert.equal(runtime.decision(query).decision, 'ABORT');
    } finally { runtime.close(); }
  }
}

async function trustedReceipts() {
  const runtime = fixture.runtime({ verifyReady: async (request) => ({ ...fixture.receipt(request, 'ready'),
    missionId: 'foreign' }) });
  try {
    await fixture.prepare(runtime, 'prepared');
    const participant = runtime.state('transition-1').plan.participants[0];
    await assert.rejects(runtime.apply(fixture.ready(runtime, participant)), /not independently verified/);
    assert.equal(Object.keys(runtime.state('transition-1').ready).length, 0);
  } finally { runtime.close(); }
  const checkpoint = fixture.runtime({ verifyCheckpoint: async (request) => ({ ...fixture.checkpointReceipt(request),
    requestDigest: digest({ ...request, missionId: 'foreign' }) }) });
  try {
    await fixture.prepare(checkpoint, 'quiescing');
    await assert.rejects(checkpoint.apply(fixture.next(checkpoint, 'CHECKPOINT')), /checkpoint receipt mismatch/);
    assert.equal(checkpoint.state('transition-1').status, 'quiescing');
  } finally { checkpoint.close(); }
}

async function incompleteApplication() {
  let available = false;
  const runtime = fixture.runtime({ verifyApplied: async (request) => available ? fixture.receipt(request, 'applied') : null });
  try {
    await fixture.prepare(runtime);
    await runtime.apply(fixture.next(runtime, 'COMMIT'));
    const query = bindings.query(runtime.state('transition-1'));
    await assert.rejects(runtime.apply(fixture.next(runtime, 'FINALIZE')), /application missing/);
    await runtime.apply(fixture.next(runtime, 'RECOVERY_REQUIRED'));
    assert.equal(runtime.state('transition-1').status, 'recovery_required');
    assert.equal(runtime.decision(query).decision, 'COMMIT');
    available = true;
    await runtime.apply(fixture.next(runtime, 'FINALIZE'));
    assert.equal(runtime.state('transition-1').status, 'finalized');
  } finally { runtime.close(); }
}

async function main() {
  await durableCommit();
  await allParticipantsRequired();
  await rejectionAndAbort();
  await trustedReceipts();
  await incompleteApplication();
  console.log('MORPH durable coordinator, irreversible decisions and complete receipts passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
