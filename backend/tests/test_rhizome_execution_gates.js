'use strict';

const assert = require('node:assert/strict');
const action = require('../src/services/rhizome/runtime/rhizomeActionExecutor');
const registrations = require('../src/services/rhizome/runtime/registeredProviderService');
const results = require('../src/services/rhizome/runtime/executionResultService');
const runtime = require('../src/services/rhizome/runtime/rhizomeRuntime');
const rhizome = require('../src/services/rhizomeCoordinationService');
const admission = require('../src/services/rhizome/security/capabilityAdmissionService');
const fx = require('./helpers/rhizomeExecutionFixtures');

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'rhizome-execution-gates-test';

async function executionBinding() {
  const need = { needId: 'answer', capability: 'answer' };
  const route = { route: { routeId: 'route:answer:tool', nodeIds: ['tool'], edgeIds: [] } };
  const input = { need, route, execute: async () => ({ answer: 42 }) };
  const valid = await action.execute({ ...input, verify: fx.makeReceipt });
  assert.equal(valid.status, 'VERIFIED');
  const forged = await action.execute({ ...input, verify: context => fx.makeReceipt({ ...context, executionDigest: results.capture({ answer: 0 }).executionDigest }) });
  assert.equal(forged.status, 'VERIFICATION_REJECTED');
  const mutation = await action.execute({ ...input, verify: context => {
    context.result.answer = 0;
    return fx.makeReceipt({ ...context, executionDigest: results.capture(context.result).executionDigest });
  } });
  assert.equal(mutation.status, 'VERIFICATION_REJECTED');
  assert.equal(mutation.result.answer, 42);
  const timed = await action.execute({ ...input, timeoutMs: 5, execute: () => new Promise(() => {}) });
  assert.equal(timed.reason, 'RHIZOME_OPERATION_TIMEOUT');
}

async function providerLifecycle() {
  for (const kind of Object.keys(registrations.KINDS)) {
    let starts = 0, probes = 0, stops = 0;
    const [provider] = registrations.create([{ kind, providerId: kind, capabilities: ['answer'],
      start: async () => { starts++; return { instanceId: 'instance-' + kind }; },
      probe: async () => { probes++; return { status: 'AVAILABLE', evidenceRefs: ['probe'], reliability: 0.9 }; },
      execute: async () => 42, stop: async () => { stops++; } }]);
    const instance = await provider.instantiate({});
    assert.equal(instance.node.kind, registrations.KINDS[kind]);
    await provider.dispose(instance);
    assert.deepEqual([starts, probes, stops], [1, 1, 1]);
  }
  let released = 0;
  const [unavailable] = registrations.create([{ kind: 'service', providerId: 'missing', capabilities: ['answer'],
    start: async () => ({ instanceId: 'failed' }), probe: async () => ({ status: 'UNAVAILABLE' }),
    execute: async () => 42, stop: async () => { released++; } }]);
  assert.equal(await unavailable.instantiate({}), null);
  assert.equal(released, 1);
}

async function protectedRouting() {
  const session = await rhizome.composeRhizome('Preserve private constraints.', { variant: 'private', nodes: [fx.node('public', ['answer'])] });
  const route = await rhizome.routeToCapability(session.sessionId, { needId: 'private-answer', capability: 'answer' }, { routingPolicy: { privateOnly: false } });
  assert.equal(route.selected, false);
  await rhizome.closeSession(session.sessionId);
  const branching = await rhizome.composeRhizome('Select through the public routing API.', { nodes: [fx.node('a', ['answer']), fx.node('b', ['answer'])] });
  const need = { needId: 'choice', capability: 'answer' };
  const first = await rhizome.routeToCapability(branching.sessionId, need, { routingPolicy: { selection: 'softmax', random: () => 0 } });
  const last = await rhizome.routeToCapability(branching.sessionId, need, { routingPolicy: { selection: 'softmax', random: () => 0.999999 } });
  assert.notEqual(first.route.routeId, last.route.routeId);
  await rhizome.closeSession(branching.sessionId);
}

function providerBinding() {
  const node = { ...fx.node('candidate', ['answer']), state: 'DISCOVERED', providers: [{ providerId: 'a', kind: 'tool', reference: 'a' }] };
  const proof = fx.makeProof({ node, candidate: { candidateId: 'candidate' }, need: { capability: 'answer' } });
  const changed = { ...node, providers: [{ providerId: 'b', kind: 'tool', reference: 'b' }] };
  assert.throws(() => admission.admit(changed, proof, { trustedProviderIds: ['a', 'b'], trustedVerifierDigests: [fx.DIGEST] }), { code: 'RHIZOME_ADMISSION_EVIDENCE_REQUIRED' });
}

async function missionDeadline() {
  const session = await rhizome.composeRhizome('Reject late execution.', { nodes: [fx.node('tool', ['answer'])] });
  const report = await runtime.run({ sessionId: session.sessionId, needs: [{ needId: 'late', capability: 'answer' }],
    maxDurationMs: 15, trustedVerifierDigests: [fx.DIGEST], dynamicVariants: false,
    execute: async () => { await new Promise(resolve => setTimeout(resolve, 40)); return 42; }, verify: fx.makeReceipt });
  assert.equal(report.status, 'INCOMPLETE');
  assert.equal(report.stopReason, 'TIME_BUDGET');
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(session.routeResults.length, 0, 'late output cannot be promoted');
  await rhizome.closeSession(session.sessionId);
}

async function run() {
  providerBinding();
  await executionBinding();
  await providerLifecycle();
  await protectedRouting();
  await missionDeadline();
}
run().then(() => console.log('Rhizome concrete output binding, deadlines, six provider lifecycles and private routing: PASS'))
  .catch(error => { console.error(error); process.exitCode = 1; });
