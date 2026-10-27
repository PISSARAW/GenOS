'use strict';

const { referenceScore } = require('../scenarios/runtime');

function topEvidence(observation) {
  return [...observation.candidates].sort((left, right) => right.metrics.salience - left.metrics.salience)[0];
}

function scenarioAwareChoice(request) {
  const { scenarioId, observation } = request;
  return [...observation.candidates].sort((left, right) =>
    referenceScore(scenarioId, right.metrics) - referenceScore(scenarioId, left.metrics))[0];
}

function selectRemembered(observation, memory) {
  return observation.candidates.find((item) => memory[item.clue] === item.id) || topEvidence(observation);
}

function selectHypothesis(observation) {
  return [...observation.candidates].sort((left, right) =>
    Object.values(right.metrics).reduce((sum, value) => sum + value, 0)
    - Object.values(left.metrics).reduce((sum, value) => sum + value, 0))[0];
}

function selectMutatedStrategy(observation, memory) {
  const index = memory.preferredIndex ?? observation.candidates.length - 1;
  return observation.candidates[index % observation.candidates.length];
}

function chooseCandidate(systemId, request, memory) {
  const { scenarioId, observation } = request;
  const choices = {
    periodic_llm_loop: () => observation.candidates[0],
    fixed_first_candidate: () => observation.candidates[0],
    react_classic: () => topEvidence(observation),
    scenario_rule_solver: () => scenarioAwareChoice(request),
    oracle_score_upper_bound: () => scenarioAwareChoice(request),
    voyager_adapted: () => selectRemembered(observation, memory),
    ai_scientist_v2_adapted: () => selectHypothesis(observation),
    darwin_godel_machine_adapted: () => selectMutatedStrategy(observation, memory)
  };
  const choose = choices[systemId];
  if (!choose) throw new Error(`No executable adapter for system: ${systemId}`);
  return choose();
}

function createAdapter(systemId) {
  const memory = Object.create(null);
  return Object.freeze({
    id: systemId,
    disclosure: systemId.endsWith('_adapted')
      ? 'Local deterministic adaptation; not the original system or a published reproduction.'
      : 'Local deterministic reference policy; no external LLM is called.',
    async solve(request) {
      const selected = chooseCandidate(systemId, request, memory);
      const evidenceRefs = [`${selected.id}:metric:${request.scenarioId}`];
      if (systemId === 'voyager_adapted') memory[selected.clue] = selected.id;
      if (systemId === 'darwin_godel_machine_adapted') {
        memory.preferredIndex = selected.metrics.salience >= 90 ? Number(selected.id.split('-')[1]) : 0;
      }
      return { answerId: selected.id, evidenceRefs,
        actions: Math.min(request.budget, 1 + Object.keys(selected.metrics).length) };
    }
  });
}

const SYSTEM_IDS = Object.freeze([
  'oracle_score_upper_bound', 'fixed_first_candidate', 'scenario_rule_solver',
  'react_classic', 'periodic_llm_loop', 'voyager_adapted',
  'ai_scientist_v2_adapted', 'darwin_godel_machine_adapted'
]);

module.exports = { SYSTEM_IDS, createAdapter };
