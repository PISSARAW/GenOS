'use strict';

const LOOP_ACTIONS = Object.freeze({
  fast: ['worker_rebind', 'worker_migration', 'budget_shift', 'parametric_patch', 'communication_adjustment', 'spawn_verifier', 'pause_branch'],
  structural: ['nest', 'split', 'merge', 'topology_change', 'variant_change', 'subgraph_replace', 'compete', 'retire', 'spawn'],
  evolutionary: ['learn_pattern', 'mutate_prior', 'update_transition_policy', 'update_relation_prior']
});

const EVENT_ACTIONS = Object.freeze({
  VERIFICATION_FAILED: 'SUBGRAPH_REPLACE',
  VERIFICATION_INCONCLUSIVE: 'VARIANT_CHANGE',
  HYPOTHESIS_REFUTED: 'SUBGRAPH_REPLACE',
  HYPOTHESIS_CONFIRMED: 'NO_CHANGE',
  BUDGET_PRESSURE: 'PARAMETRIC_PATCH',
  WORKER_STUCK: 'WORKER_MIGRATION',
  WORKER_FAILED: 'WORKER_MIGRATION',
  DIVERSITY_COLLAPSE: 'SPAWN',
  NO_PROGRESS: 'COMPETE',
  NEW_EVIDENCE: 'NO_CHANGE',
  CONTRADICTION_FOUND: 'COMPETE',
  DAEMON_FINDING: 'PARAMETRIC_PATCH',
  ENVIRONMENT_CHANGED: 'WORKER_MIGRATION',
});

const EVIDENCE_REQUIRED = new Set([
  'VERIFICATION_FAILED', 'HYPOTHESIS_REFUTED', 'CONTRADICTION_FOUND',
]);

function classifyAction(action) {
  const normalized = String(action).toLowerCase();
  for (const [loop, actions] of Object.entries(LOOP_ACTIONS)) {
    if (actions.includes(normalized)) return loop;
  }
  return 'unknown';
}

function loopIsDue(loop, timing = {}) {
  const interval = timing.intervalMs;
  return Number.isFinite(interval) && interval >= 0 && timing.now - timing.lastRunAt >= interval;
}

function normalizeEventType(event) {
  return String(event?.type || event?.eventType || '').toUpperCase();
}

function decideEventAction(event, context = {}) {
  const type = normalizeEventType(event);
  const action = EVENT_ACTIONS[type];
  if (!action) throw new TypeError(`Unsupported morphogenesis event: ${type || 'unknown'}`);
  const gated = EVIDENCE_REQUIRED.has(type)
    && (!Array.isArray(event.evidence) || event.evidence.length === 0 || context.evidenceValidated !== true);
  if (gated) return { eventType: type, action: 'NO_CHANGE', proposedAction: action, status: 'BLOCKED', reason: 'verified evidence is required' };
  if (type === 'DIVERSITY_COLLAPSE' && context.spawnAllowed === false) {
    return { eventType: type, action: 'NO_CHANGE', proposedAction: action, status: 'BLOCKED', reason: 'worker spawning is disallowed' };
  }
  return {
    eventType: type,
    action,
    status: 'PROPOSED',
    requiresPatchValidation: action !== 'NO_CHANGE',
    evidence: Array.isArray(event.evidence) ? event.evidence : [],
  };
}

module.exports = { LOOP_ACTIONS, EVENT_ACTIONS, classifyAction, loopIsDue, decideEventAction };
