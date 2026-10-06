'use strict';

function adapt(ecology, command) {
  const population = ecology.populations.find(p => p.populationId === command.populationId);
  const individual = population?.individuals.find(i => i.individualId === command.individualId);
  if (!individual || !Array.isArray(command.evidenceRefs) || !command.evidenceRefs.some(ref => typeof ref === 'string' && ref.trim())) {
    throw failure('A known individual and evidence are required for adaptation.');
  }
  validatePatch(command.patch);
  const phenotype = { ...individual.phenotype, ...command.patch };
  ecology.populations = ecology.populations.map(p => p.populationId === population.populationId
    ? { ...p, individuals: p.individuals.map(i => i.individualId === individual.individualId ? { ...i, phenotype } : i) } : p);
  const history = ecology.ecologicalState.phenotypeAdaptations || [];
  ecology.ecologicalState.phenotypeAdaptations = [...history, { individualId: individual.individualId,
    populationId: population.populationId, patch: command.patch, evidenceRefs: command.evidenceRefs,
    tick: ecology.ecologicalState.runtime?.tick || 0 }].slice(-500);
  return { individual: { ...individual, phenotype },
    action: { type: 'PHENOTYPE_ADAPTED', status: 'applied', individualId: individual.individualId } };
}

function validatePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length) throw failure('A phenotype patch is required.');
  const validators = { strategy: text, focus: text,
    temperature: value => bounded(value, 2), learningRate: value => bounded(value, 1) };
  for (const [key, value] of Object.entries(patch)) {
    if (!validators[key]?.(value)) throw failure(`Unsupported phenotype field or value '${key}'.`);
  }
}

function text(value) { return typeof value === 'string' && value.trim().length > 0 && value.length <= 500; }
function bounded(value, maximum) { return Number.isFinite(value) && value >= 0 && value <= maximum; }
function failure(message) { return Object.assign(new Error(message), { code: 'BIOME_PHENOTYPE_INVALID' }); }

module.exports = { adapt };
