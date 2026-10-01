'use strict';

function identityOf(item, index) {
  const id = item.id || `obj_${index + 1}`;
  return { id, entityId: item.entityId || id, temporalIdentity: item.temporalIdentity || id };
}

function historyOf(item) {
  const confidence = Number(item.confidence);
  const boundedConfidence = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 1;
  return {
    confidence: item.occluded ? 0.5 : boundedConfidence,
    prediction: item.prediction || null, predictionError: Math.max(0, Number(item.predictionError) || 0),
    occlusionState: item.occluded ? 'occluded' : 'visible', causalHypotheses: Array.isArray(item.causalHypotheses) ? [...item.causalHypotheses] : []
  };
}

function makeBinding(item, index) {
  return {
    ...identityOf(item, index), features: { ...(item.features || {}) }, relation: item.relation || null,
    sourceModalities: Array.isArray(item.sourceModalities) ? [...item.sourceModalities] : [item.modality || 'unknown'],
    ...historyOf(item)
  };
}

function carryForwardBinding(id, value) {
  return { ...value, id, features: value.features || {}, relation: value.relation || null, confidence: Math.max(0, Number(value.confidence || 0) * 0.8), occlusionState: 'not_observed' };
}

function buildPerceptGraph(bindings) {
  const entities = bindings.map(({ id, entityId, temporalIdentity, features, confidence, sourceModalities, prediction, predictionError, occlusionState, causalHypotheses }) => ({ id, entityId, temporalIdentity, features, confidence, sourceModalities, prediction, predictionError, occlusionState, causalHypotheses }));
  const relations = bindings.filter((binding) => binding.relation).map((binding) => ({ source: binding.id, relation: binding.relation }));
  return { entities, relations };
}

function bindPercepts(input) {
  const items = Array.isArray(input?.items) ? input.items : [];
  const previous = input?.previous || {};
  const bindings = items.map(makeBinding);
  for (const [id, value] of Object.entries(previous)) if (!bindings.some((binding) => binding.id === id)) bindings.push(carryForwardBinding(id, value));
  return bindings;
}

function recurrentUpdate(state, observation) {
  const current = Array.isArray(state) ? state : [];
  const next = bindPercepts({ items: observation?.items || [], previous: Object.fromEntries(current.map((item) => [item.id, item])) });
  return { bindings: next, graph: buildPerceptGraph(next), recurrence: next.length > 0 && current.length > 0, resolvedOcclusions: next.filter((item) => item.confidence > 0.5).length };
}

function bindingPermutation(items) {
  const list = Array.isArray(items) ? items : [];
  return list.map((item, index) => ({ ...item, id: `${item.id || index}_permuted`, relation: item.relation ? `${item.relation}_permuted` : null }));
}

module.exports = { bindPercepts, recurrentUpdate, bindingPermutation, buildPerceptGraph };
