'use strict';

const curiosity = require('../../curiosityService');
const trails = require('../environmentalMemory/environmentalTrailStore');
const routing = require('../environmentalMemory/stigmergicRoutingService');
const environment = require('../environment/environmentModelService');

function record(session, population, result) {
  const state = session.ecology.ecologicalState;
  if (Number.isFinite(result.predictionError) && result.predictionError >= 0) {
    const domains = state.learningDomains || {};
    const prior = domains[population.nicheId] || {};
    state.learningDomains = { ...domains, [population.nicheId]: curiosity.updateDomainAfterObservation(prior, result) };
  }
  state.lastMeasuredTick = state.runtime.tick + 1;
  if (!result.environmentPatch) return;
  const updated = environment.applyEnvironmentUpdate({ environment: session.ecology.environment,
    patch: result.environmentPatch, reason: 'measured niche construction', evidenceRefs: result.evidenceRefs });
  session.ecology.environment = updated.environment;
  session.ecology.environmentConstraints = updated.constraints.evaluations;
  session.ecology.opportunityMap = updated.opportunities;
  state.nicheConstructions = [...(state.nicheConstructions || []), { resultId: result.id,
    version: updated.environment.version, evidenceRefs: result.evidenceRefs }].slice(-500);
}

function enrich(session, input) {
  const domains = Object.values(session.ecology.ecologicalState.learningDomains || {});
  const scores = domains.map(domain => curiosity.computeCuriosity(domain));
  const population = session.ecology.populations.find(p => p.populationId === input.populationId)
    || session.ecology.populations.find(p => p.individuals.length && p.status !== 'extinct');
  return { ...input, curiosity: input.curiosity ?? average(scores),
    populationId: input.populationId ?? population?.populationId,
    currentPatchId: input.currentPatchId ?? population?.patchId ?? population?.nicheId,
    alternatives: alternatives(session, input.alternatives) };
}

function alternatives(session, supplied) {
  const groups = new Map();
  for (const trail of trails.read(session.matrix)) {
    groups.set(trail.location, [...(groups.get(trail.location) || []), trail]);
  }
  const ranked = routing.rankLocations([...groups].map(([location, entries]) => ({ location, trails: entries })));
  const patches = ranked.map(item => ({ patchId: item.location, expectedReturn: item.gradient.expectedYield,
    expectedInformationGain: Math.max(0, item.gradient.attractant - item.gradient.repellent), risk: item.gradient.risk }));
  const selected = new Map(patches.map(patch => [patch.patchId, patch]));
  for (const patch of supplied || []) selected.set(patch.patchId, { ...selected.get(patch.patchId), ...patch });
  return [...selected.values()];
}

function disturbance(ecology, input) {
  if (input.confirmLocalExtinction !== true || !input.failedPopulationIds?.length) return;
  const refs = (input.evidenceRefs || []).filter(ref => typeof ref === 'string' && ref.trim());
  if (!refs.length) return;
  const baseline = ecology.populations.filter(p => !['extinct', 'dormant'].includes(p.status))
    .reduce((sum, p) => sum + p.productivity, 0);
  ecology.ecologicalState.disturbance = { id: input.disturbanceId || null,
    tick: ecology.ecologicalState.runtime.tick + 1, baseline, evidenceRefs: refs };
}

function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }

module.exports = { record, enrich, disturbance };
