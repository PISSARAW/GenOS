'use strict';

const assert = require('node:assert/strict');
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'mission-obligation-context-test-only';

const { issueReceipt } = require('../src/services/epistemicVerifierReceiptService');
const outcome = require('../src/services/missionOutcomeContract');
const obligations = require('../src/services/agentRuntimeAdapter/missionObligationContext');
const scope = require('../src/services/agentMemoryScope');
const memory = require('../src/services/agentMemoryContext');
const { attachMissionMemoryContext } = require('../src/services/agentRuntimeAdapter/missionLease');

const hash = `sha256:${'c'.repeat(64)}`;
const verifierDigest = `sha256:${'b'.repeat(64)}`;
const evidenceDigest = `sha256:${'a'.repeat(64)}`;
const contract = { schema: outcome.SCHEMA, goal: 'Check both claims', obligations: [
  { id: 'first', statement: 'First claim is correct.' },
  { id: 'second', statement: 'Second claim is correct.' }
], statuses: [...outcome.STATUSES] };
const record = { contract: { mission_outcome: contract }, contractHash: hash, version: 4 };

function proofForFirst() {
  const receipt = (nonce) => issueReceipt({ resultId: 'first-result', evidenceDigest,
    verifierDigest, status: 'verified', independent: true, nonce,
    coveredObligations: ['first-result'], independenceDescriptor: {
      actorId: `independent-${nonce}`, workspaceId: `workspace-${nonce}` } });
  return { gateContext: { aeisEvaluation: { allAccepted: true, assembly: {
    results: [{ resultId: 'first-result', canonicalStatement: contract.obligations[0].statement,
      evidence: { digest: evidenceDigest } }], verifications: [receipt('one'), receipt('two')]
  } }, trustedVerifierDigests: [verifierDigest] } };
}

function progress() {
  return { contractHash: hash, contractVersion: 4, verification: proofForFirst(), event: {} };
}

function verifyScopeFiltering(context) {
  const records = [
    { title: 'closed success', obligationIds: ['first'], contractHash: hash, contractVersion: 4 },
    { title: 'open success', obligationIds: ['second'], contractHash: hash, contractVersion: 4 },
    { title: 'old failure', obligationIds: ['second'], contractHash: hash, contractVersion: 3,
      status: 'FAILURE' },
    { title: 'contradiction', obligationIds: ['first'], contractHash: hash, contractVersion: 4,
      category: 'Contradiction' },
    { title: 'generic failure', status: 'FAILURE' }
  ];
  assert.deepEqual(scope.filterForObligations(records, context).map((item) => item.title),
    ['open success', 'contradiction', 'generic failure']);
}

function verifyContractBinding() {
  const context = obligations.fromContract(record, { obligationProgress: progress() });
  assert.deepEqual(context.open.map((item) => item.id), ['second']);
  assert.deepEqual(context.verifiedIds, ['first']);
  assert.ok(obligations.queryFor('Task', context).includes('Second claim is correct.'));
  assert.ok(!obligations.queryFor('Task', context).includes('First claim is correct.'));
  verifyScopeFiltering(context);
  const forged = obligations.fromContract(record, { obligationProgress: { contractHash: hash,
    contractVersion: 4, verification: {}, verifiedObligations: ['first', 'second'] } });
  assert.deepEqual(forged.open.map((item) => item.id), ['first', 'second']);
  assert.throws(() => obligations.fromContract(record, { obligationProgress: {
    ...progress(), contractVersion: 3 } }), { code: 'GENOS_CONTEXT_OBLIGATION_STALE' });
}

async function verifyRuntimeEntry() {
  const original = memory.formatCognitiveMemoryPrompt;
  const calls = [];
  memory.formatCognitiveMemoryPrompt = async (agentId, query, opts) => {
    calls.push({ agentId, query, opts });
    return 'historical-memory';
  };
  try {
    const mission = { prompt: 'Check claims', contextTokenBudget: 400,
      obligationProgress: progress() };
    await attachMissionMemoryContext(mission, 'agent-test', record);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].opts.obligationContext.open.map((item) => item.id), ['second']);
    assert.equal(calls[0].opts.scopeTask, 'Check claims');
    assert.ok(mission.prompt.includes(`version=4; hash=${hash}`));
    assert.ok(mission.prompt.includes('historical-memory'));

    const mandatory = { prompt: 'Check claims', contextTokenBudget: 200,
      obligationProgress: progress(), useMemoryContext: false };
    await attachMissionMemoryContext(mandatory, 'agent-test', record);
    assert.equal(calls.length, 1);
    assert.ok(mandatory.prompt.includes('Second claim is correct.'));
    assert.ok(!mandatory.prompt.includes('historical-memory'));

    memory.formatCognitiveMemoryPrompt = async () => 'x'.repeat(3000);
    const degraded = { prompt: 'Check claims', contextTokenBudget: 200,
      obligationProgress: progress() };
    await attachMissionMemoryContext(degraded, 'agent-test', record);
    assert.equal(degraded.memoryContextDegradation, 'optional_memory_exceeds_context_budget');
    assert.ok(!degraded.prompt.includes('xxx'));
    await assert.rejects(attachMissionMemoryContext({ prompt: 'Check claims',
      contextTokenBudget: 2 }, 'agent-test', record),
    { code: 'GENOS_CONTEXT_BUDGET_EXCEEDED' });
  } finally {
    memory.formatCognitiveMemoryPrompt = original;
  }
}

async function run() {
  verifyContractBinding();
  await verifyRuntimeEntry();
  console.log('Mission obligation context selection and budget passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
