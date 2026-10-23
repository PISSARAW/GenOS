'use strict';

const assert = require('node:assert/strict');
const { digest } = require('../src/services/evidenceContractService');
const processOutcome = require('../src/services/agentProcessOutcome');
const terminalStatus = require('../src/services/agentTerminalStatusService');
const evidenceCollector = require('../src/services/missionEvidenceCollector');
const { decideMissionAction } = require('../src/services/missionActionDecisionService');
const { SCHEMA, STATUSES } = require('../src/services/missionOutcomeContract');
const completionContract = require('../src/services/missionCompletionContract');

function verifiedCompletion() {
  const content = { missionId: 'mission-contract', workerId: 'worker-contract',
    result: { status: 'completed', verified: true } };
  const proof = { reference: digest(content), content };
  return { missionId: 'mission-contract', requiredMemberIds: ['worker-contract'],
    members: [{ memberId: 'worker-contract', status: 'completed', evidenceRefs: [proof.reference] }],
    evidenceProofs: [proof], topologyValidation: { status: 'verified', reasons: [] } };
}

async function testEvidenceCollector(input) {
  const base = { db: null,
    missionId: 'mission-contract', agents: [{ id: 'worker-contract', execution_mode: 'worker',
      status: 'completed' }], flags: { noFailedAgents: true, allAgentsCompleted: true },
    evidenceProofs: input.evidenceProofs };
  const completion = await evidenceCollector.evaluateCollectedCompletion(base);
  assert.equal(completion.verdict, 'succeeded');
  const partial = await evidenceCollector.evaluateCollectedCompletion({ ...base,
    barrierStatus: 'partial' });
  assert.equal(partial.verdict, 'partial');
}

function testProcessOutcome(input) {
  const succeeded = processOutcome.runtimeExitOutcome(null, 0, {
    domainVerdict: 'completed', unverified: false, completionInput: input
  });
  assert.equal(succeeded.verdict, 'succeeded');
  assert.equal(succeeded.status, 'completed');
  const barrierPartial = processOutcome.runtimeExitOutcome(null, 0, {
    domainVerdict: 'completed', unverified: false,
    completionInput: { ...input, barrierStatus: 'partial' }
  });
  assert.equal(barrierPartial.verdict, 'partial');
  const missing = processOutcome.runtimeExitOutcome(null, 0, {
    domainVerdict: 'completed', unverified: false,
    completionInput: { ...input, evidenceProofs: [] }
  });
  assert.equal(missing.verdict, 'partial');
  assert.equal(missing.status, 'unverified');
  const leafWorker = processOutcome.runtimeExitOutcome(null, 0, {
    domainVerdict: 'completed', unverified: false, leafExecution: true
  });
  assert.equal(leafWorker.verdict, 'succeeded');
  assert.equal(leafWorker.status, 'completed');
}

function testTerminalStatus(input) {
  const ctx = { agentId: 'worker-contract', state: { pendingTerminalStatuses: new Map(),
    executionQueue: Promise.resolve(), missionDomainState: { unverified: false } } };
  const accepted = terminalStatus.queue(ctx, { eventType: 'AGENT_COMPLETED', status: 'accepted',
    trackedEventId: 'accepted', payload: { completionInput: input } }, 'accepted');
  assert.equal(accepted.verdict, 'in_progress');
  assert.equal(ctx.state.pendingTerminalStatuses.get('accepted').nextStatus, 'running');
  const succeeded = terminalStatus.queue(ctx, { eventType: 'AGENT_COMPLETED', status: 'completed',
    trackedEventId: 'completed', payload: { completionInput: input } }, 'completed');
  assert.equal(succeeded.verdict, 'succeeded');
  assert.equal(ctx.state.pendingTerminalStatuses.get('completed').nextStatus, 'completed');
  const incomplete = { ...input, evidenceProofs: [] };
  const partial = terminalStatus.queue(ctx, { eventType: 'AGENT_COMPLETED', status: 'completed',
    trackedEventId: 'partial', payload: { completionInput: incomplete } }, 'completed');
  assert.equal(partial.verdict, 'partial');
  assert.equal(ctx.state.pendingTerminalStatuses.get('partial').nextStatus, 'unverified');
  const leafCtx = { ...ctx, dispatchedAgent: { execution_mode: 'worker' } };
  const leaf = terminalStatus.queue(leafCtx, { eventType: 'AGENT_COMPLETED', status: 'completed',
    trackedEventId: 'leaf', payload: {} }, 'completed');
  assert.equal(leaf.verdict, 'succeeded');
  assert.equal(leafCtx.state.pendingTerminalStatuses.get('leaf').nextStatus, 'completed');
  const emptyRoot = completionContract.evaluate({ lifecycleState: 'completed', barrierStatus: 'complete',
    topologyValidation: { status: 'verified' } });
  assert.equal(emptyRoot.verdict, 'partial', 'an empty root mission still fails closed without a worker roster');
  const synthesisCtx = { ...ctx, dispatchedAgent: { execution_mode: 'orchestrator' },
    autonomyPlan: { synthesisOnly: true, completedWorkerIds: ['worker-a', 'worker-b'] },
    state: { ...ctx.state, verifiedDossierWorkerIds: ['worker-a', 'worker-b'] } };
  assert.equal(terminalStatus.verifiedSynthesis(synthesisCtx), true);
  const synthesis = terminalStatus.queue(synthesisCtx, { eventType: 'AGENT_COMPLETED', status: 'completed',
    trackedEventId: 'verified-synthesis', payload: {} }, 'completed');
  assert.equal(synthesis.verdict, 'succeeded');
  const closeOutcome = processOutcome.runtimeExitOutcome(null, 0, { domainVerdict: 'completed',
    unverified: false, leafExecution: terminalStatus.verifiedSynthesis(synthesisCtx) });
  assert.equal(closeOutcome.status, 'completed', 'process close must preserve the verified synthesis verdict');
  const incompleteSynthesis = { ...synthesisCtx, state: { ...synthesisCtx.state,
    verifiedDossierWorkerIds: ['worker-a'] } };
  assert.equal(terminalStatus.verifiedSynthesis(incompleteSynthesis), false,
    'synthesis can close only after every expected worker dossier is verified');
}

function testActionDecision(input) {
  const contract = { schema: SCHEMA, goal: 'Deliver verified output',
    obligations: [{ id: 'answer', statement: 'Answer is verified' }], statuses: [...STATUSES] };
  const base = { missionId: 'mission-contract', contract, actions: [],
    budget: { tokens: 1, usd: 1, latencyMs: 1 },
    policy: { weights: { tokens: 1, usd: 0, latencyMs: 0 } } };
  const adapters = { verifyOutcome: (outcome) => outcome.trusted === true };
  const accepted = decideMissionAction({ ...base,
    outcome: { status: 'accepted', trusted: true, completionInput: input } }, adapters);
  assert.equal(accepted.verdict, 'in_progress');
  assert.notEqual(accepted.selectedId, 'none');
  const verified = decideMissionAction({ ...base,
    outcome: { status: 'verified', trusted: true, completionInput: input } }, adapters);
  assert.equal(verified.verdict, 'succeeded');
  assert.equal(verified.selectedId, 'none');
  const partial = decideMissionAction({ ...base, outcome: { status: 'verified', trusted: true,
    completionInput: { ...input, barrierStatus: 'partial' } } }, adapters);
  assert.equal(partial.verdict, 'partial');
  assert.notEqual(partial.selectedId, 'none');
}

async function main() {
  const input = verifiedCompletion();
  testProcessOutcome(input);
  testTerminalStatus(input);
  testActionDecision(input);
  await testEvidenceCollector(input);
  console.log('Uniform mission completion contract: PASS');
}

main().catch((error) => { console.error(error); process.exit(1); });
