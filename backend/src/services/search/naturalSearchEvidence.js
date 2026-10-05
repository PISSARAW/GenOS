const { PROVENANCE } = require('./hypothesisLedgerService');
const { HYPOTHESIS_FAMILIES, STRATEGIES } = require('./searchGenomeService');

function resolveProvenance(event) {
  if (['TOOL_EXECUTED', 'TOOL_RESULT', 'TOOL_CALL_COMPLETED'].includes(event.eventType)) return PROVENANCE.OBSERVED;
  // Evidence reports contain claims. Their event name is not a verifier receipt.
  return PROVENANCE.SELF_REPORTED;
}

function finiteGain(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function eligibleHypothesis(state, event) {
  const target = state.ledger.hypotheses.get(event.payload?.hypothesisId);
  if (!target || target.agentId !== state.agentId || target.status === 'falsified') return null;
  return target;
}

function ingestEvidence(state, event) {
  const payload = event.payload || {};
  const target = eligibleHypothesis(state, event);
  if (!target) return;
  if (!finiteGain(payload.evidenceGain) && !payload.evidenceRef) return;
  const provenance = resolveProvenance(event);
  state.ledger.addEvidence(target.id, { direction: 'for', strength: Math.min(1, finiteGain(payload.evidenceStrength ?? 0.5)),
    provenance, reliability: 0.7, independent: false, evidenceRef: payload.evidenceRef || null,
    sourceAgent: state.agentId, sourceTool: event.eventType });
  if (provenance === PROVENANCE.OBSERVED && finiteGain(payload.evidenceGain) > 0) state.lastProgressStep = state.stepCount;
}

function ingestFailureEvidence(state, event) {
  const target = eligibleHypothesis(state, event);
  if (!target) return;
  state.ledger.addEvidence(target.id, { direction: 'against', strength: 0.5,
    provenance: PROVENANCE.OBSERVED, reliability: 0.8, independent: false, evidenceRef: `error:${event.eventType}` });
  state.integration.recordNegative(state.agentId, target,
    { ref: event.eventType, strength: 0.5, reliability: 0.8 }, { signature: event.eventType, conditions: [], scope: 'agent' });
}

function buildSearchSignals(ledger, agentId) {
  const hypotheses = ledger.hypothesesForAgent(agentId);
  const supported = hypotheses.filter(h => h.status === 'supported');
  const failed = hypotheses.filter(h => h.status === 'falsified');
  return {
    successfulFamilies: HYPOTHESIS_FAMILIES.filter(f => supported.some(h => h.statement.includes(f))),
    failedFamilies: HYPOTHESIS_FAMILIES.filter(f => failed.some(h => h.statement.includes(f))),
    recommendedStrategies: STRATEGIES.filter(s => supported.some(h => h.statement.includes(s)))
  };
}

module.exports = { resolveProvenance, finiteGain, ingestEvidence, ingestFailureEvidence, buildSearchSignals };
