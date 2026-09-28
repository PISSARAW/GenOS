'use strict';

const { createReceipt } = require('./versionedContractService');
const { persistReceipt } = require('./versionedContractPersistenceService');

function invalid(code, message) {
  throw Object.assign(new Error(message), { code });
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanRefs(refs) {
  return Array.isArray(refs) ? [...new Set(refs.filter((ref) => typeof ref === 'string' && ref.trim()).map((ref) => ref.trim()))] : [];
}

function recordState(input) {
  const data = input || {};
  if (!isRecord(data.state)) invalid('INVALID_WORLD_STATE', 'World state must be an object.');
  const evidenceRefs = cleanRefs(data.evidenceRefs);
  return {
    stateId: typeof data.stateId === 'string' && data.stateId.trim() ? data.stateId.trim() : `state_${Date.now()}`,
    state: structuredClone(data.state),
    evidenceRefs,
    status: evidenceRefs.length ? 'supported' : 'uncertain',
  };
}

function deltaFor(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const delta = {};
  for (const key of keys) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    const entry = { before: before[key], after: after[key] };
    if (Number.isFinite(before[key]) && Number.isFinite(after[key])) entry.change = after[key] - before[key];
    delta[key] = entry;
  }
  return delta;
}

async function recordTransition(db, input) {
  if (!isRecord(input) || typeof input.action !== 'string' || !input.action.trim()
    || typeof input.missionClass !== 'string' || !input.missionClass.trim()) {
    invalid('INVALID_WORLD_TRANSITION', 'Action and missionClass are required.');
  }
  const before = recordState(input.before);
  const after = recordState(input.after);
  const evidenceRefs = cleanRefs([...before.evidenceRefs, ...after.evidenceRefs]);
  const receipt = createReceipt('WorldTransition', {
    stateBefore: before.state,
    action: input.action.trim(),
    delta: deltaFor(before.state, after.state),
    stateAfter: after.state,
    context: { ...(isRecord(input.context) ? input.context : {}), missionClass: input.missionClass.trim() },
    evidenceRefs,
    observedAt: input.observedAt || new Date().toISOString(),
  }, { runId: input.runId, sourceRefs: evidenceRefs });
  const persisted = await persistReceipt(db, receipt, { eventType: 'WORLD_STATE_TRANSITION_RECORDED' });
  return { ...persisted, receipt, before, after };
}

function observedSupport(expectedDelta, delta) {
  const entries = Object.entries(expectedDelta);
  if (!entries.length) return null;
  const matched = entries.filter(([key, expected]) => {
    const actual = delta[key];
    if (!actual) return false;
    const observed = Number.isFinite(actual.change) ? actual.change : actual.after;
    return JSON.stringify(observed) === JSON.stringify(expected);
  }).length;
  return matched / entries.length;
}

function compareStates(beforeInput, afterInput, options = {}) {
  const before = recordState(beforeInput);
  const after = recordState(afterInput);
  const delta = deltaFor(before.state, after.state);
  const expectedDelta = isRecord(options.expectedDelta) ? options.expectedDelta : {};
  const evidenceSupported = before.status === 'supported' && after.status === 'supported';
  const expectedSupport = observedSupport(expectedDelta, delta);
  const support = expectedSupport === null ? Number(evidenceSupported) : expectedSupport;
  const uncertainty = Math.max(1 - support, evidenceSupported ? 0 : 1);
  const changedKeys = Object.keys(delta);
  const known = Array.isArray(options.knownStateKeys) ? new Set(options.knownStateKeys) : null;
  const outOfDistribution = options.outOfDistribution === true
    || Boolean(known && changedKeys.some((key) => !known.has(key)));
  const threshold = Number.isFinite(options.maxUncertainty) ? options.maxUncertainty : 0.5;
  return { delta, changedKeys, support, uncertainty, outOfDistribution, decisionReady: uncertainty <= threshold && !outOfDistribution };
}

function conditionMatches(state, conditions) {
  return Object.entries(conditions || {}).every(([key, expected]) => {
    const actual = state[key];
    if (isRecord(expected)) return Number.isFinite(actual)
      && (!Number.isFinite(expected.min) || actual >= expected.min)
      && (!Number.isFinite(expected.max) || actual <= expected.max);
    return JSON.stringify(actual) === JSON.stringify(expected);
  });
}

function scoreCandidate(candidate, penalty) {
  if (!Number.isFinite(candidate.expectedUtility)) invalid('INVALID_CANDIDATE', 'Candidate utility must be finite.');
  const uncertainty = Number.isFinite(candidate.uncertainty) ? candidate.uncertainty : 0;
  if (uncertainty < 0 || uncertainty > 1) invalid('INVALID_CANDIDATE', 'Candidate uncertainty must be between zero and one.');
  return { ...candidate, uncertainty, adjustedUtility: candidate.expectedUtility - penalty * uncertainty };
}

function rankCandidates(candidates, state, penalty) {
  const ranked = [];
  for (const candidate of candidates) {
    if (!applicableCandidate(candidate, state)) continue;
    ranked.push(scoreCandidate(candidate, penalty));
  }
  return ranked.sort(compareUtility);
}

function applicableCandidate(candidate, state) {
  return isRecord(candidate) && conditionMatches(state, candidate.conditions);
}

function compareUtility(left, right) {
  return right.adjustedUtility - left.adjustedUtility;
}

function choiceResult(ranked, hasEvidence) {
  if (!ranked.length) return { selected: null, alternatives: [], distinct: false, decisionReady: false, reason: 'no_supported_condition' };
  const distinct = ranked.length > 1 && ranked[0].action !== ranked[1].action;
  return { selected: ranked[0], alternatives: ranked.slice(1), distinct, decisionReady: hasEvidence, reason: hasEvidence ? null : 'state_evidence_missing' };
}

function conditionalChoice(input) {
  const data = input || {};
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  if (!hasChoiceInputs(data.state, candidates)) invalid('INSUFFICIENT_CANDIDATES', 'A state and at least two conditional candidates are required.');
  const state = isRecord(data.state.state) ? data.state.state : data.state;
  const hasEvidence = cleanRefs(data.state.evidenceRefs || data.evidenceRefs).length > 0;
  const penalty = Number.isFinite(data.uncertaintyPenalty) ? Math.max(0, data.uncertaintyPenalty) : 1;
  if (data.outOfDistribution === true) return { selected: null, alternatives: [], distinct: false, decisionReady: false, reason: 'out_of_distribution' };
  return choiceResult(rankCandidates(candidates, state, penalty), hasEvidence);
}

function hasChoiceInputs(state, candidates) {
  return isRecord(state) && candidates.length >= 2;
}

module.exports = { recordState, recordTransition, compareStates, conditionalChoice };
