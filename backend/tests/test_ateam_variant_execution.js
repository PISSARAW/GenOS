'use strict';

const assert = require('node:assert/strict');
const execution = require('../src/services/aTeam/variants/variantExecutionService');

async function testPipeline() {
  const cache = new Map();
  let calls = 0;
  const stages = [{
    stageId: 'normalize', inputSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } },
    outputSchema: { type: 'object', required: ['text', 'normalized'], properties: { text: { type: 'string' }, normalized: { type: 'boolean' } } },
    run: async (value) => { calls += 1; return { ...value, normalized: true }; }
  }];
  const result = await execution.executePipeline({ input: { text: 'A' }, stages, cache, maxRetries: 0 });
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(calls, 1);
  const cached = await execution.executePipeline({ input: { text: 'A' }, stages, cache });
  assert.equal(cached.stages[0].status, 'CACHED');
  assert.equal(calls, 1);

  const attempts = [];
  const retried = await execution.executePipeline({
    input: { text: 'B' }, maxRetries: 1, backoffMs: 0, sleep: async () => {},
    stages: [{ ...stages[0], run: async (value, context) => {
      attempts.push(context.attempt);
      if (context.attempt === 1) throw Object.assign(new Error('temporary'), { code: 'TRANSIENT_FAILURE' });
      return { ...value, normalized: true };
    } }]
  });
  assert.equal(retried.status, 'SUCCEEDED');
  assert.deepEqual(attempts, [1, 2]);
  const invalid = await execution.executePipeline({ input: { text: 3 }, stages });
  assert.equal(invalid.code, 'INPUT_CONTRACT_REJECTED');
}

async function testStreamAndConsensus() {
  async function* source() { yield { text: 'x' }; yield { text: 'y' }; }
  const items = [];
  for await (const value of execution.executePipelineStream({
    source: source(), stages: [{ stageId: 'copy', inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: async (value) => value }]
  })) items.push(value);
  assert.equal(items.length, 2);

  const consensus = execution.evaluateConsensus({ protocol: { quorum: 2 }, ballots: [
    { memberId: 'a', decision: 'approve', evidenceRefs: ['e1'] },
    { memberId: 'b', decision: 'approve', evidenceRefs: ['e2'] },
    { memberId: 'c', decision: 'reject', evidenceRefs: ['e3'] }
  ] });
  assert.equal(consensus.status, 'CONSENSUS');
  assert.equal(consensus.dissent.length, 1);
}

function testAuthoritiesAndHandoffs() {
  const authority = { decisionType: 'release', functionalOwnerId: 'fn', productOwnerId: 'po', escalationPath: 'sponsor' };
  assert.equal(execution.resolveMatrixDecision({
    authority, currentRevision: 2,
    decision: { type: 'release', revision: 2, functionalApproval: true, functionalApproverId: 'fn', productApproval: true, productApproverId: 'po' }
  }).status, 'APPROVED');
  assert.throws(() => execution.resolveMatrixDecision({
    authority, currentRevision: 2,
    decision: { type: 'release', revision: 1, functionalApproval: true, functionalApproverId: 'fn' }
  }), { code: 'ATEAM_MATRIX_REVISION_CONFLICT' });

  const handoff = execution.createRelayHandoff({ version: 1, sequence: 2, previousOwner: 'a', nextOwner: 'b', context: { x: 1 }, evidenceRefs: ['receipt://1'] });
  assert.equal(execution.acknowledgeRelay({ ...handoff, receiverId: 'b', accepted: true }).status, 'ACCEPTED');
  assert.throws(() => execution.acknowledgeRelay({ ...handoff, context: { x: 2 }, receiverId: 'b', accepted: true }), { code: 'ATEAM_RELAY_DIGEST_MISMATCH' });
}

function testOperationalGates() {
  assert.equal(execution.authorizeUrgentAction({
    now: 100, mandate: { hardTimebox: { enforceAt: 200 }, allowedActions: ['restart'], remainingBudget: 5 }, action: { type: 'restart', cost: 2 }
  }).authorized, true);
  assert.throws(() => execution.authorizeUrgentAction({
    now: 201, mandate: { hardTimebox: { enforceAt: 200 }, allowedActions: ['restart'] }, action: { type: 'restart' }
  }), { code: 'ATEAM_TIGER_TIMEBOX_EXPIRED' });

  const handover = execution.advanceIncidentPeriod({ state: { status: 'ACTIVE', period: 1 }, event: { type: 'HANDOVER', actorId: 'commander' } });
  assert.equal(handover.status, 'HANDOVER_PENDING');
  const accepted = execution.advanceIncidentPeriod({ state: handover, event: { type: 'HANDOVER_ACCEPTED', actorId: 'new-commander' } });
  assert.equal(accepted.period, 2);

  assert.equal(execution.evaluateJoin({ join: { type: 'ANY', predecessors: ['a', 'b'] }, statuses: { a: 'SUCCEEDED', b: 'RUNNING' } }).ready, true);
  assert.equal(execution.authorizeStaffingChange({
    proposal: { capability: 'security', capabilityGap: true, expectedCoverageGain: 0.8, verified: true },
    policy: { hysteresisThreshold: 0.5 }, availableBudget: 20
  }).approved, true);
}

async function run() {
  await testPipeline();
  await testStreamAndConsensus();
  testAuthoritiesAndHandoffs();
  testOperationalGates();
}

run().then(() => console.log('A-Team variant execution contracts passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
