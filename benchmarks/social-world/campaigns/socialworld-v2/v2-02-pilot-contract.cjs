'use strict';

const crypto = require('node:crypto');

const MODEL = 'ollama://qwen2.5:14b';
const AGENT_COUNT = 24;
const SIMULATED_DAYS = 7;
const CYCLES = 1000;
const EVENT_CYCLES = [32, 127, 226, 319, 414, 509, 607, 706, 803, 905];
const ROOT_ARMS = ['existing-social-runtime', 'social-development-loop'];
const MAX_MODEL_CALLS_PER_DAY = 4;
const MAX_MESSAGES_PER_DAY = 4;
const SCOPE = { organizationId: 'socialworld-v2-pilot-org', projectId: 'socialworld-v2-pilot-project' };

function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function indexFor(seed, cycle, salt) {
  const value = crypto.createHash('sha256').update(`${seed}:${cycle}:${salt}`).digest();
  return value.readUInt32LE(0) % AGENT_COUNT;
}

function agentId(index) { return `social-pilot-agent-${String(index).padStart(2, '0')}`; }

function dayForCycle(cycle) { return Math.min(SIMULATED_DAYS - 1, Math.floor(cycle * SIMULATED_DAYS / CYCLES)); }

function eventSchedule(seed) {
  return EVENT_CYCLES.map((cycle, index) => {
    const senderIndex = indexFor(seed, cycle, 'sender');
    const domainIndex = (senderIndex + 1) % AGENT_COUNT;
    const id = `${seed}:environment:${String(index + 1).padStart(2, '0')}`;
    return { cycle, day: dayForCycle(cycle), eventId: id, agentId: agentId(senderIndex),
      summary: `A teammate needs sourced help with navigation task ${index + 1}.`,
      domain: `navigation-${domainIndex}`, evidenceRefs: [`world:${id}`], isReply: false,
      replyToAgentId: null, sourceEventId: id };
  });
}

function comparisonHashes(seed, events) {
  const budget = { maxModelCallsPerDay: MAX_MODEL_CALLS_PER_DAY,
    maxMessagesPerDay: MAX_MESSAGES_PER_DAY, callsPerDecision: 1 };
  const permissions = { organizationId: SCOPE.organizationId, projectId: SCOPE.projectId,
    relationClasses: ['social', 'collaborative', 'organizational'], foreignTenants: false };
  return { eventsHash: digest({ seed, events }), budgetHash: digest(budget),
    permissionsHash: digest(permissions), budget, permissions };
}

function comparisonKeyHashesEqual(arms) {
  const expected = arms[0]?.comparison || {};
  return arms.length === ROOT_ARMS.length && arms.every((arm) => arm.comparison
    && arm.comparison.eventsHash === expected.eventsHash
    && arm.comparison.budgetHash === expected.budgetHash
    && arm.comparison.permissionsHash === expected.permissionsHash);
}

function validReceipt(receipt, recipientAgentId) {
  if (!receipt) return { valid: false, delivered: false, reason: 'checkpoint-receipt-missing' };
  const published = receipt.executed?.published === true;
  if (!published) return { valid: receipt.outcome?.deliveryConfirmed !== true,
    delivered: false, reason: receipt.executed?.reason || 'not-published' };
  const acknowledgements = receipt.executed.deliveryAcknowledgements || [];
  const acknowledgement = acknowledgements.find((item) => item.recipientAgentId === recipientAgentId);
  const verified = receipt.outcome?.deliveryConfirmed === true && acknowledgement
    && ['acked', 'seen'].includes(acknowledgement.status) && acknowledgement.evidenceHash;
  return { valid: Boolean(verified), delivered: Boolean(verified),
    reason: verified ? null : 'delivery-receipt-invalid', signalId: receipt.executed.signalId || null };
}

function metricsOf(input) {
  const { records, cycles, modelCalls, memoryEpisodeCount } = input;
  const delivered = records.filter((record) => record.receipt?.delivered === true);
  const initiations = delivered.filter((record) => !record.event.isReply);
  const reciprocals = delivered.filter((record) => record.event.isReply
    && record.recipientAgentId === record.event.replyToAgentId);
  return { cycles, agents: AGENT_COUNT, simulatedDays: SIMULATED_DAYS, modelCalls,
    initiatives: initiations.length,
    distinctRecipients: new Set(initiations.map((record) => record.recipientAgentId)).size,
    reciprocals: reciprocals.length, validDeliveryReceipts: delivered.length,
    memoryEpisodes: memoryEpisodeCount,
    decisionsWithSocialMemory: records.filter((record) => record.memoryIds?.length > 0).length,
    invalidReceipts: records.filter((record) => record.receipt?.valid === false).length };
}

function armErrors(arms) {
  const errors = [];
  for (const arm of arms) {
    if (!arm || arm.completed !== true) errors.push(`${arm?.arm || 'arm'}:incomplete`);
    if (arm?.metrics?.cycles !== CYCLES || arm?.metrics?.agents !== AGENT_COUNT
      || arm?.metrics?.simulatedDays !== SIMULATED_DAYS) errors.push(`${arm?.arm || 'arm'}:world-shape-mismatch`);
    if (arm?.metrics?.invalidReceipts > 0) errors.push(`${arm.arm}:invalid-delivery-receipt`);
    if (arm?.integrityEvents?.length > 0) errors.push(`${arm.arm}:gvx-ledger-chain-invalid`);
  }
  if (!comparisonKeyHashesEqual(arms)) errors.push('paired-input-hashes-differ');
  return errors;
}

function evaluatePilot(evidence) {
  const arms = evidence?.arms || [];
  const errors = armErrors(arms);
  if (evidence?.warmup?.completed !== true) errors.push('qwen-warmup-incomplete');
  if (evidence?.warmup?.servedModel !== 'qwen2.5:14b') errors.push('qwen-warmup-model-mismatch');
  if (errors.length) return { status: 'inconclusive', errors, checks: {} };
  const integrated = arms.find((arm) => arm.arm === 'social-development-loop')?.metrics || {};
  const checks = { initiativeThreshold: integrated.initiatives >= 3,
    distinctRecipientThreshold: integrated.distinctRecipients >= 2,
    reciprocalInteraction: integrated.reciprocals >= 1,
    persistentMemory: integrated.memoryEpisodes >= integrated.validDeliveryReceipts };
  return { status: Object.values(checks).every(Boolean) ? 'pass' : 'fail', errors: [], checks };
}

function reportFor(input) {
  const evaluation = evaluatePilot(input.evidence);
  const baseline = input.evidence.arms.find((arm) => arm.arm === ROOT_ARMS[0])?.metrics || {};
  const integrated = input.evidence.arms.find((arm) => arm.arm === ROOT_ARMS[1])?.metrics || {};
  return { campaignId: 'socialworld-v2', scenario: 'V2-02', arm: 'paired-diagnostic-pilot',
    seed: `pilot-${input.seed}`, attempt: 1, sourceCommit: input.sourceCommit,
    runtimeVersion: '3', model: MODEL, configHash: input.configHash,
    status: evaluation.status, campaignDisposition: 'diagnostic-pilot',
    startedAt: input.startedAt, durationMs: input.durationMs,
    inputs: { simulation: { agents: AGENT_COUNT, days: SIMULATED_DAYS, cycles: CYCLES },
      comparison: input.comparison, budget: input.comparison.budget,
      permissions: input.comparison.permissions,
      baselineDefinition: 'Même prompt, schéma Qwen, candidats relationnels, mémoires, checkpoint RPE et persistance d’épisode; sans admission attention/AGOW ni socialDevelopmentLoopService.' },
    observed: { baseline, integrated,
      deltas: { initiatives: integrated.initiatives - baseline.initiatives,
        distinctRecipients: integrated.distinctRecipients - baseline.distinctRecipients,
        reciprocals: integrated.reciprocals - baseline.reciprocals } },
    oracle: { recalculable: true, checks: evaluation.checks },
    evidenceRefs: [input.evidenceName], violations: evaluation.errors,
    limitations: ['Une graine pilote ne permet pas une conclusion statistique.',
      'Le transport représente des agents simulés; aucune utilité de tâche indépendante ni reprise après redémarrage n’est évaluée.',
      'Une mémoire présente dans le contexte ne prouve pas qu’elle a causé une meilleure décision.',
      'Le bras baseline partage le prompt, la sélection de candidats et le checkpoint RPE avec le bras intégré; il isole l’effet du cycle social/AGOW, pas toute l’ancienne pile runtime.'] };
}

function validMemoryReferences(decision, memories) {
  const memoryIds = new Set(memories.map((memory) => memory.id));
  return Array.isArray(decision.memoryReferences) && decision.memoryReferences.every((id, index) =>
    memoryIds.has(id) && decision.memoryReferences.indexOf(id) === index);
}

function validDecisionFields(decision, candidates) {
  const actionValid = ['contact', 'silence'].includes(decision.action);
  const recipientValid = decision.action === 'silence' ? decision.recipientAgentId === null
    : candidates.some((candidate) => candidate.agentId === decision.recipientAgentId);
  return actionValid && recipientValid
    && ['inform', 'request', 'coordinate'].includes(decision.purpose)
    && ['evidence-matched', 'evidence-insufficient', 'no-admissible-recipient'].includes(decision.reasonCode)
    && (decision.action !== 'contact' || decision.reasonCode === 'evidence-matched');
}

function validateDecision(response, candidates, memories = []) {
  if (response?.schemaViolation || !response?.structured || typeof response.structured !== 'object') {
    throw new Error('qwen-structured-response-invalid');
  }
  const decision = response.structured;
  if (!validMemoryReferences(decision, memories)) throw new Error('qwen-memory-reference-out-of-contract');
  if (!validDecisionFields(decision, candidates)) throw new Error('qwen-decision-out-of-contract');
  return decision;
}

module.exports = { MODEL, AGENT_COUNT, SIMULATED_DAYS, CYCLES, ROOT_ARMS,
  MAX_MODEL_CALLS_PER_DAY, MAX_MESSAGES_PER_DAY, SCOPE, digest, agentId, dayForCycle,
  eventSchedule, comparisonHashes, comparisonKeyHashesEqual, validReceipt, metricsOf,
  evaluatePilot, reportFor, validateDecision };
