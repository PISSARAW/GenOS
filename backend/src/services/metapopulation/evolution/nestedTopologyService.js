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
  if (!input.context?.patch || !input.context?.graph) {
    return { committed: false, errors: ['deme morphology patch and graph are required'], regionalTopologyUnchanged: true };
  }
  const result = await transitionMorphology(input.context, input.adapters || {});
  return { ...result, demeId: input.demeId, regionalTopologyUnchanged: true };
}

function finiteSignal(value, fallback) { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback; }

module.exports = { planNestedTopologies, executeNestedTransition, planDemeTopology };
