'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'terminal-negative-memory-test';
const assert = require('node:assert/strict');
const memory = require('../src/services/terminalNegativeOutcomeMemory');
const terminalOutcome = require('../src/services/terminalOutcomeEvidence');
const biological = require('../src/services/biologicalIntegrity');
const validation = require('../src/services/morphogenesis/learning/outcomeEvidenceValidation');
const verifierTrust = require('../src/services/verifierTrustRegistry');
const receipts = require('../src/services/epistemicVerifierReceiptService');
const workerStore = require('../src/services/biologicalWorkerStore');

const run = { id: 'negative-run-1', agent_id: 'agent-negative-1', status: 'failed' };
const binding = { runId: run.id, workerId: run.agent_id, missionId: 'mission-negative-1',
  tenant: { organizationId: 'org-negative', projectId: 'project-negative' } };
const event = signedFailureEvent();
const biologicalReceipt = { runId: run.id, workerId: run.agent_id, missionId: binding.missionId,
  result: { status: 'failed', verified: false }, evidence: { observations: [biological.digest(event)] } };
const rows = new Map();
const originalBinding = workerStore.binding;
const originalReceipt = workerStore.receipt;
workerStore.binding = async () => binding;
workerStore.receipt = async () => biologicalReceipt;

const db = {
  exec: async () => {},
  run: async (_sql, ...values) => {
    const [runId, agentId, missionId, organizationId, projectId, eventJson, eventHash, evidenceJson, evidenceHash] = values;
    if (rows.has(runId)) return { changes: 0 };
    rows.set(runId, { run_id: runId, agent_id: agentId, mission_id: missionId, organization_id: organizationId,
      project_id: projectId, event_json: eventJson, event_hash: eventHash, evidence_json: evidenceJson,
      evidence_hash: evidenceHash, created_at: '2026-10-15T21:00:00.000Z' });
    return { changes: 1 };
  },
  get: async (sql, runId) => {
    if (sql.includes('verified_terminal_failures')) return rows.get(runId) || null;
    if (sql.includes('strategy_execution_runs')) return run;
    return null;
  },
  all: async (...query) => [...rows.values()].filter((row) => row.agent_id === query[1]
    && row.organization_id === query[2] && row.project_id === query[3]).slice(0, query[4])
};

async function main() {
  const causalOutbox = require('../src/services/causalLearningOutbox');
  const vectorMemory = require('../src/services/vectorMemoryService');
  const episodicMemory = require('../src/services/episodicMemoryService');
  const originals = { causal: causalOutbox.recentMemories, vector: vectorMemory.searchMemory,
    episodes: episodicMemory.getRecentEpisodes };
  try {
    const input = { run, biologicalReceipt, event };
    assert.deepEqual(await memory.record(db, input), {
      status: 'recorded', runId: run.id, receiptId: event.payload.negativeOutcomeEvidence.receiptId, replayed: false
    });
    assert.equal((await memory.record(db, input)).replayed, true, 'same signed failure is idempotent');
    assert.deepEqual(await memory.recentMemories(db, { agentId: run.agent_id,
      organizationId: binding.tenant.organizationId, projectId: binding.tenant.projectId }), [{
      id: run.id, title: 'Issue négative vérifiée · AGENT_FAILED',
      content: `Le vérificateur indépendant a attesté une issue négative pour le run ${run.id}. Référence: ${event.payload.negativeOutcomeEvidence.receiptId}.`,
      status: 'FAILURE', category: 'Failure', organizationId: binding.tenant.organizationId,
      projectId: binding.tenant.projectId, createdAt: '2026-10-15T21:00:00.000Z',
      evidenceRefs: [event.payload.negativeOutcomeEvidence.receiptId],
      provenance: { runId: run.id, missionId: binding.missionId, receiptId: event.payload.negativeOutcomeEvidence.receiptId },
      provenanceIntegrity: biological.digest(event.payload.negativeOutcomeEvidence)
    }]);
    causalOutbox.recentMemories = async () => [];
    vectorMemory.searchMemory = async () => ({ allScoredExperiences: [], pitfallsToAvoid: [], topSuccessfulGoldenPaths: [] });
    episodicMemory.getRecentEpisodes = async () => [];
    const recalled = await require('../src/services/agentMemoryPrompt').retrieveAgentMemories(
      run.agent_id, 'retry the failed strategy', { db, organizationId: binding.tenant.organizationId,
        projectId: binding.tenant.projectId });
    assert.equal(recalled.pitfalls.some((item) => item.status === 'FAILURE'
      && item.content.includes(event.payload.negativeOutcomeEvidence.receiptId)), true,
    'verified negative outcomes reach the agent memory prompt as scoped pitfalls');

    const unsigned = { ...event, payload: { ...event.payload, negativeOutcomeEvidenceStatus: { status: 'unavailable' } } };
    const unsignedReceipt = { ...biologicalReceipt, evidence: { observations: [biological.digest(unsigned)] } };
    assert.deepEqual(await memory.record(db, { run, biologicalReceipt: unsignedReceipt, event: unsigned }), {
      status: 'refused', reason: 'signed_negative_outcome_evidence_required'
    });
    const crossTenant = await memory.recentMemories(db, { agentId: run.agent_id,
      organizationId: 'org-other', projectId: 'project-other' });
    assert.deepEqual(crossTenant, [], 'negative memories remain tenant scoped');
    console.log('Signed negative terminal evidence is bound, durable, idempotent and tenant-scoped: PASS');
  } finally {
    causalOutbox.recentMemories = originals.causal;
    vectorMemory.searchMemory = originals.vector;
    episodicMemory.getRecentEpisodes = originals.episodes;
    workerStore.binding = originalBinding;
    workerStore.receipt = originalReceipt;
  }
}

function signedFailureEvent() {
  const base = { eventType: 'AGENT_FAILED', payload: { executionRunId: run.id,
    failure: { category: 'assertion', reason: 'sensitive detail is not copied into prompt memory' } } };
  const receiptId = `negative:${run.id}`;
  const evidence = { status: 'VERIFIED', kind: 'oracle', receiptId, success: false, value: 0,
    actionId: run.id, agentId: run.agent_id, organizationId: binding.tenant.organizationId,
    projectId: binding.tenant.projectId,
    learningContext: { schema: terminalOutcome.NEGATIVE_OUTCOME_SCHEMA, eventType: base.eventType,
      terminalEventHash: terminalOutcome.terminalEventHash(base) } };
  evidence.receipt = receipts.issueReceipt({ resultId: receiptId, evidenceDigest: validation.evidenceDigest(evidence),
    verifierDigest: verifierTrust.ensureVerifier('testResult').digest, independent: true, status: 'verified', nonce: receiptId,
    independenceDescriptor: { actorId: 'independent-failure-oracle', workspaceId: 'isolated-negative-evaluator' } });
  return { ...base, payload: { ...base.payload, negativeOutcomeEvidence: evidence,
    negativeOutcomeEvidenceStatus: { status: 'verified', schema: terminalOutcome.NEGATIVE_OUTCOME_SCHEMA, receiptId } } };
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
