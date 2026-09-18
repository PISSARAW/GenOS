'use strict';

function worlds(model) { return Array.isArray(model?.worlds) ? model.worlds : []; }
function validateWorlds(nodes) {
  if (!nodes.length || new Set(nodes).size !== nodes.length || nodes.some((world) => typeof world !== 'string')) throw new Error('Modal model requires unique string worlds.');
}
function validateActualWorld(model, nodes) {
  if (model.actualWorld && !nodes.includes(model.actualWorld)) throw new Error('actualWorld must belong to the modal model.');
}
function validateEdges(model, nodes) {
  const edges = Array.isArray(model.accessibility) ? model.accessibility : [];
  const invalid = edges.some((edge) => !Array.isArray(edge) || edge.length !== 2 || !nodes.includes(edge[0]) || !nodes.includes(edge[1]));
  if (invalid) throw new Error('Accessibility edges must reference known worlds.');
}
function validateModel(model) {
  const nodes = worlds(model);
  validateWorlds(nodes);
  validateActualWorld(model, nodes);
  validateEdges(model, nodes);
}
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
  validateModel(model);
  if (!String(formula || '').trim()) throw new Error('A modal formula is required.');
  return { formula, actualWorld: model.actualWorld || worlds(model)[0], value: evaluate(formula, model), semantics: 'kripke', uncertainty: { status: 'bounded-model-evaluation' }, promotionEligible: false };
}
function frameProperties({ model } = {}) {
  validateModel(model);
  const nodes = worlds(model);
  const reflexive = nodes.every((world) => accessible(model, world).includes(world));
  const transitive = nodes.every((a) => accessible(model, a).every((b) => accessible(model, b).every((c) => accessible(model, a).includes(c))));
  const symmetric = nodes.every((a) => accessible(model, a).every((b) => accessible(model, b).includes(a)));
  return { reflexive, transitive, symmetric, systems: { T: reflexive, S4: reflexive && transitive, S5: reflexive && symmetric && transitive } };
}
module.exports = { evaluateFormula, frameProperties };
