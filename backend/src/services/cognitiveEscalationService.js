/**
 * Cognitive Escalation Service — the "LLM as interrupt" gate.
 *
 * When the Signal Plane cannot dispatch a signal deterministically
 * (no receptor matched), this service decides whether to escalate to
 * LLM cognition, selects the best cognitive target, builds a minimal
 * zero-prompt context, and records escalation outcomes for metrics.
 *
 * Core principle: the LLM is an interrupt, not the substrate.
 * Escalation is the exception, not the rule.
 */

const plasticity = require('./synapticPlasticityService');
const { SIGNAL_TYPES, isSupportedSignalType } = require('./biomimeticSignalingBus');
const { getDatabase } = require('../db');

const ESCALATION_METRICS = {
  total: 0,
  totalCost: 0,
  byOutcome: {},
  startedAt: Date.now(),
};

const VALID_SIGNAL_TYPES = new Set(Object.values(SIGNAL_TYPES));

function isUnknownSignalType(signalType) {
  const norm = String(signalType || '').trim().toLowerCase();
  return !VALID_SIGNAL_TYPES.has(norm);
}

function extractSalience(signal) {
  const candidates = [
    signal.salience,
    signal.signalData?.salience,
    signal.signalData?.concentration,
    signal.concentration,
    signal.signalData?.score,
    signal.signalData?.priority,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/**
 * Returns true if the signal genuinely needs LLM cognitive processing.
 * Heuristic: unknown type, salience > 0.5, and no receptor matched.
 */
function shouldEscalate(signal) {
  if (!signal) return false;
  if (signal.llmRequired !== true) return false;
  if (isUnknownSignalType(signal.signalType)) return true;
  return extractSalience(signal) > 0.5;
}

async function fetchParentOrchestrator(senderAgentId) {
  if (!senderAgentId) return null;
  try {
    const db = await getDatabase();
    const row = await db.get(
      `SELECT parent_agent_id FROM agents
       WHERE id = ? AND execution_mode = 'worker'`,
      senderAgentId
    );
    return row?.parent_agentId || row?.parent_agent_id || null;
  } catch {
    return null;
  }
}

async function fetchWorkerIdsForOrchestrator(orchestratorId) {
  if (!orchestratorId) return [];
  try {
    const db = await getDatabase();
    const rows = await db.all(
      `SELECT id FROM agents
       WHERE parent_agent_id = ? AND execution_mode = 'worker'
       AND status NOT IN ('completed','terminated','apoptosis','error','failed','unverified','quarantined')
       LIMIT 20`,
      orchestratorId
    );
    return rows.map((r) => r.id);
  } catch {
    return [];
  }
}

/**
 * Returns the best agent to handle this signal.
 * Heuristic: pick the agent with the highest getChannelWeight() from sender,
 * or fallback to the sender's parent orchestrator.
 */
async function selectCognitiveTarget(signal) {
  const senderId = signal.senderAgentId;
  const parentId = await fetchParentOrchestrator(senderId);
  const candidates = await fetchWorkerIdsForOrchestrator(parentId);
  let bestId = parentId;
  let bestWeight = -1;
  for (const candidateId of candidates) {
    const { weight } = plasticity.getChannelWeight(senderId, candidateId);
    if (weight > bestWeight) {
      bestWeight = weight;
      bestId = candidateId;
    }
  }
  return bestId || parentId || senderId || 'cognitive-fallback';
}

/**
 * Returns a minimal prompt context from the signal.
 * Zero-prompt principle: only structural metadata, never raw content.
 */
function buildMinimalContext(signal) {
  const data = signal.signalData && typeof signal.signalData === 'object'
    ? signal.signalData
    : {};
  return {
    signalType: signal.signalType,
    topic: signal.topic || null,
    sender: signal.senderAgentId || null,
    signalId: signal.signalId || signal.id || null,
    dataKeys: Object.keys(data),
    salience: extractSalience(signal),
    escalatedAt: new Date().toISOString(),
  };
}

/**
 * Logs the escalation result for metrics.
 */
function recordEscalationOutcome(signalId, outcome, cost) {
  ESCALATION_METRICS.total++;
  ESCALATION_METRICS.totalCost += Number(cost) || 0;
  ESCALATION_METRICS.byOutcome[outcome] = (ESCALATION_METRICS.byOutcome[outcome] || 0) + 1;
  ESCALATION_METRICS.lastSignalId = signalId;
  ESCALATION_METRICS.lastOutcome = outcome;
  ESCALATION_METRICS.lastAt = Date.now();
}

/**
 * Returns total escalations, total cost, escalation rate.
 */
function getEscalationMetrics() {
  const elapsedMs = Date.now() - ESCALATION_METRICS.startedAt;
  const elapsedMin = Math.max(elapsedMs / 60000, 1 / 60);
  return {
    total: ESCALATION_METRICS.total,
    totalCost: Number(ESCALATION_METRICS.totalCost.toFixed(4)),
    byOutcome: { ...ESCALATION_METRICS.byOutcome },
    ratePerMin: Number((ESCALATION_METRICS.total / elapsedMin).toFixed(3)),
    lastSignalId: ESCALATION_METRICS.lastSignalId || null,
    lastOutcome: ESCALATION_METRICS.lastOutcome || null,
    uptimeMs: elapsedMs,
  };
}

module.exports = {
  shouldEscalate,
  selectCognitiveTarget,
  buildMinimalContext,
  recordEscalationOutcome,
  getEscalationMetrics,
  ESCALATION_METRICS,
};
