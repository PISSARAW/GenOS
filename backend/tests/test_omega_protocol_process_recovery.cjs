'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { network } = require('./helpers/omegaProcessNetwork.cjs');
const fixture = require('./helpers/omegaProcessFixtures.cjs');
const { digest } = require('../src/services/evidenceProtocol/canonical');

async function refuseForeignEffectContext(net) {
  for (const field of ['baseDigest', 'policyDigest']) {
    const effect = fixture.expectedEffect();
    effect[field] = digest(`foreign-${field}`);
    await assert.rejects(net.nodes.resource.request('execute', effect, fixture.EXECUTOR), /binding rejected/);
  }
  assert.equal((await net.nodes.resource.request('effects')).length, 0);
}

async function missingCapability(net) {
  const conversationId = 'unavailable-verifier';
  const description = fixture.message('DESCRIBE_RUNTIME', { conversationId });
  await net.send(description);
  const submission = structuredClone(fixture.SUBMISSION);
  submission.planId = 'unavailable-plan';
  submission.program.operations[2].reference = 'uninstalled-verifier';
  submission.program.policy.check = ['uninstalled-verifier'];
  const request = fixture.message('SUBMIT_PROGRAM', { conversationId, causes: [description.messageId], payload: { submission } });
  await assert.rejects(net.send(request), /unavailable/);
}

async function admit(net) {
  const description = fixture.message('DESCRIBE_RUNTIME');
  await net.send(description);
  const submitted = fixture.message('SUBMIT_PROGRAM', { causes: [description.messageId] });
  const proposed = await net.send(submitted);
  assert.equal(proposed.planDigest, fixture.message('ACCEPT_PLAN').payload.planDigest);
  const accepted = await net.send(fixture.message('ACCEPT_PLAN', { causes: [submitted.messageId] }));
  assert.equal(accepted.status, 'accepted');
  assert.deepEqual(accepted.plan.obligations.map(item => item.kind), ['READ', 'SELECT', 'CHECK', 'EMIT']);
}

async function contextRefusal(net) {
  const filename = path.join(net.places.executor, 'source.json');
  fs.writeFileSync(filename, JSON.stringify({ ...fixture.BASE, revision: 'changed-base' }));
  await assert.rejects(net.send(fixture.message('EXECUTE', { id: 'stale-execution' })), /context became stale/);
  fs.writeFileSync(filename, JSON.stringify(fixture.BASE));
  assert.deepEqual(await net.nodes.executor.request('counters'), { read: 0, select: 0, check: 0, infer: 0 });
}

async function crashGap(net) {
  await net.nodes.executor.request('armCrash');
  const interrupted = net.send(fixture.message('EXECUTE')).then(
    () => ({ unexpectedSuccess: true }), error => ({ error: error.message }));
  await net.nodes.executor.milestone('external-effect-applied');
  assert.equal((await net.nodes.resource.request('effects')).length, 1);
  await net.restartExecutor();
  assert.ok((await interrupted).error);
  const state = await net.nodes.executor.request('gateState');
  assert.equal(state.status, 'effect_outcome_unknown');
  assert.deepEqual(await net.nodes.executor.request('counters'), { read: 1, select: 1, check: 1, infer: 0 });
  return state.request.effectKey;
}

async function reconcileAndResume(net, effectKey) {
  await net.disconnectResource();
  const unknown = await net.send(fixture.message('RECONCILE_EFFECT', { id: 'offline-reconciliation', payload: { effectKey } }));
  assert.equal(unknown.status, 'effect_outcome_unknown');
  const report = await net.send(fixture.message('REPORT_OBLIGATIONS', { id: 'unknown-obligations' }));
  assert.equal(report.obligations.find(item => item.kind === 'EMIT').outcome, 'effect_outcome_unknown');
  await net.reconnectResource();
  const reconciled = await net.send(fixture.message('RECONCILE_EFFECT', { id: 'online-reconciliation', payload: { effectKey } }));
  assert.equal(reconciled.status, 'completed');
  const completed = await net.send(fixture.message('RESUME'));
  assert.equal(completed.status, 'completed');
  assert.equal(completed.obligations.length, 4);
  assert.ok(completed.obligations.every(item => item.executionStatus === 'completed'));
  assert.equal((await net.nodes.resource.request('effects')).length, 1);
  const authority = await net.nodes.resource.request('authority');
  assert.equal(authority.budget.spent, 1);
  assert.equal(authority.budget.reserved, 2);
  await net.restartExecutor();
  const replay = await net.send(fixture.message('RESUME', { id: 'resume-after-restart' }));
  assert.equal(replay.status, 'completed');
  assert.deepEqual(await net.nodes.executor.request('counters'), { read: 1, select: 1, check: 1, infer: 0 });
}

async function scenario(directory) {
  const net = await network(directory);
  try {
    assert.equal(new Set(Object.values(net.nodes).map(node => node.pid)).size, 3);
    await refuseForeignEffectContext(net);
    await missingCapability(net);
    await admit(net);
    await contextRefusal(net);
    await reconcileAndResume(net, await crashGap(net));
    return { processes: 3, realRuntimeOperations: 4, appliedEffects: 1,
      modelCalls: 0, completedStepsReexecuted: 0, unknownOutcomeReconciled: true };
  } finally { await net.stop(); }
}

async function run() {
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'genos-omega-process-'));
  try { console.log('OMEGA process recovery:', JSON.stringify(await scenario(directory))); }
  finally {
    assert.equal(path.dirname(path.resolve(directory)), temporaryRoot);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { scenario };
