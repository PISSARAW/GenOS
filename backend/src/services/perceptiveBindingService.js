'use strict';

function makeBinding(item, index) {
  return { id: item.id || `obj_${index + 1}`, features: { ...(item.features || {}) }, relation: item.relation || null, confidence: item.occluded ? 0.5 : 1 };
}

function bindPercepts(input) {
  const items = Array.isArray(input?.items) ? input.items : [];
  const previous = input?.previous || {};
  const bindings = items.map(makeBinding);
  for (const [id, value] of Object.entries(previous)) if (!bindings.some((binding) => binding.id === id)) bindings.push({ id, features: value.features || {}, relation: value.relation || null, confidence: Math.max(0, Number(value.confidence || 0) * 0.8) });
  return bindings;
}

function recurrentUpdate(state, observation) {
  const current = Array.isArray(state) ? state : [];
  const next = bindPercepts({ items: observation?.items || [], previous: Object.fromEntries(current.map((item) => [item.id, item])) });
  return { bindings: next, recurrence: next.length > 0 && current.length > 0, resolvedOcclusions: next.filter((item) => item.confidence > 0.5).length };
}

function bindingPermutation(items) {
  const list = Array.isArray(items) ? items : [];
  return list.map((item, index) => ({ ...item, id: `${item.id || index}_permuted`, relation: item.relation ? `${item.relation}_permuted` : null }));
}

module.exports = { bindPercepts, recurrentUpdate, bindingPermutation };
