'use strict';

const morphologyResolver = require('../../morphogenesis/topologyResolverService');
const { transitionMorphology } = require('../../morphogenesis/transitions/morphologyTransitionService');

function planNestedTopologies(input = {}) {
  const demes = Array.isArray(input.demes) ? input.demes : [];
  return { regionalTopology: 'metapopulation', demes: demes.map(planDemeTopology),
    transitionsRequireEvidence: true };
}

function planDemeTopology(deme) {
  const preferred = preferredLocalTopology(deme);
  const trigger = transitionSignal(deme);
  const changeRequested = shouldTransition(deme, preferred, trigger);
  return { demeId: deme.demeId, currentTopology: deme.localTopology || null,
    proposedTopology: changeRequested ? preferred.topology : deme.localTopology || preferred?.topology || null,
    score: preferred?.score || 0, signal: trigger, reasons: preferred?.reasons || [],
    transitionRequested: changeRequested, regionalTopologyUnchanged: true };
}

function preferredLocalTopology(deme) {
  const candidates = morphologyResolver.compareTopologies({ problemProfile: localProfile(deme),
    currentState: { topology: deme.localTopology }, availableCapabilities: deme.availableCapabilities || [],
    history: deme.topologyHistory || [] }).filter((item) => item.topology !== 'metapopulation');
  return candidates[0];
}

function shouldTransition(deme, preferred, trigger) {
  return Boolean(preferred && preferred.topology !== deme.localTopology && trigger.active);
}

function localProfile(deme) {
  return { ...(deme.morphologyProfile || {}),
    needed_diversity: finiteSignal(deme.localDiversity, 0.5),
    needed_independence: finiteSignal(deme.localIndependence, 0.5),
    domain: deme.domain || 'local-deme' };
}

function transitionSignal(deme) {
  const fitness = finiteSignal(deme.localFitness, 0);
  const errors = finiteSignal(deme.failureRate, 0);
  const stagnant = deme.stagnant === true;
  const active = fitness < 0.35 || errors > 0.5 || stagnant;
  return { active, causes: [fitness < 0.35 && 'low_local_fitness', errors > 0.5 && 'elevated_failure_rate', stagnant && 'stagnation'].filter(Boolean) };
}

async function executeNestedTransition(input = {}) {
  const errors = validateNestedTransition(input);
  if (errors.length) return { committed: false, errors, regionalTopologyUnchanged: false };
  const adapters = scopedTransitionAdapters(input);
  const result = await transitionMorphology(input.context, adapters);
  return { ...result, demeId: input.demeId, regionalTopologyUnchanged: true };
}

function validateNestedTransition(input) {
  const context = input.context || {};
  return [
    ...planErrors(input), ...graphErrors(input, context), ...patchErrors(input, context),
    ...invariantErrors(input, context)
  ];
}

function planErrors(input) {
  return input.demeId && input.plan?.transitionRequested ? [] : ['an approved local transition plan is required'];
}

function graphErrors(input, context) {
  const errors = [];
  if (context.graph?.scope !== 'deme' || context.graph.demeId !== input.demeId) errors.push('current graph must be scoped to this deme');
  if (context.graph?.topology !== input.plan?.currentTopology) errors.push('local graph topology does not match the plan');
  return errors;
}

function patchErrors(input, context) {
  return context.patch?.demeId === input.demeId && context.patch?.targetTopology === input.plan?.proposedTopology
    ? [] : ['patch must target the planned deme topology'];
}

function invariantErrors(input, context) {
  const errors = [];
  if (!context.regionalTopology) errors.push('regional topology invariant is required');
  if (typeof input.adapters?.verifyRegionalInvariant !== 'function') errors.push('regional invariant verification adapter is required');
  return errors;
}

function scopedTransitionAdapters(input) {
  const adapters = input.adapters;
  return { ...adapters, verify: async (applied, patch) => {
    const local = await adapters.verify(applied, patch);
    const regional = await adapters.verifyRegionalInvariant({ demeId: input.demeId,
      expectedTopology: input.context.regionalTopology, applied });
    return { ...local, valid: local?.valid === true && regional?.valid === true &&
      regional.topology === input.context.regionalTopology, regionalTopologyUnchanged: regional?.valid === true &&
      regional.topology === input.context.regionalTopology };
  } };
}

function finiteSignal(value, fallback) { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback; }

module.exports = { planNestedTopologies, executeNestedTransition, planDemeTopology };
