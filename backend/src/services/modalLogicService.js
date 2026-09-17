'use strict';

function worlds(model) { return Array.isArray(model?.worlds) ? model.worlds : []; }
function accessible(model, world) {
  const edges = Array.isArray(model?.accessibility) ? model.accessibility : [];
  return edges.filter((edge) => edge[0] === world).map((edge) => edge[1]);
}
function atom(formula, model, world) {
  return Boolean(model?.valuation?.[world]?.[formula]);
}
function evaluate(formula, model, world = model?.actualWorld || worlds(model)[0]) {
  const text = String(formula || '').trim();
  if (text.startsWith('!')) return !evaluate(text.slice(1), model, world);
  if (text.startsWith('□')) return accessible(model, world).every((next) => evaluate(text.slice(1), model, next));
  if (text.startsWith('◇')) return accessible(model, world).some((next) => evaluate(text.slice(1), model, next));
  return atom(text, model, world);
}
function evaluateFormula({ formula, model } = {}) {
  if (!model || !worlds(model).length) throw new Error('A modal model with worlds is required.');
  return { formula, actualWorld: model.actualWorld || worlds(model)[0], value: evaluate(formula, model), semantics: 'kripke', promotionEligible: false };
}
function frameProperties({ model } = {}) {
  const nodes = worlds(model);
  const reflexive = nodes.every((world) => accessible(model, world).includes(world));
  const transitive = nodes.every((a) => accessible(model, a).every((b) => accessible(model, b).every((c) => accessible(model, a).includes(c))));
  const symmetric = nodes.every((a) => accessible(model, a).every((b) => accessible(model, b).includes(a)));
  return { reflexive, transitive, symmetric, systems: { T: reflexive, S4: reflexive && transitive, S5: reflexive && symmetric && transitive } };
}
module.exports = { evaluateFormula, frameProperties };
