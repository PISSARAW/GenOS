'use strict';

function topEvidence(observation) {
  return [...observation.candidates].sort((left, right) => right.evidence[0] - left.evidence[0])[0];
}

function selectRemembered(observation, memory) {
  return observation.candidates.find((item) => memory[item.clue] === item.id) || topEvidence(observation);
}

function selectHypothesis(observation) {
  return [...observation.candidates].sort((left, right) =>
    right.evidence.reduce((sum, value) => sum + value, 0)
    - left.evidence.reduce((sum, value) => sum + value, 0))[0];
}

function selectMutatedStrategy(observation, memory) {
  const index = memory.preferredIndex ?? observation.candidates.length - 1;
  return observation.candidates[index % observation.candidates.length];
}

function chooseCandidate(systemId, observation, memory) {
  const choices = {
    periodic_llm_loop: () => observation.candidates[0],
    genos_no_endogenous_thought: () => observation.candidates[0],
    react_classic: () => topEvidence(observation),
    genos_no_persistent_memory: () => topEvidence(observation),
    genos_ett_full: () => topEvidence(observation),
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
      const selected = chooseCandidate(systemId, request.observation, memory);
      const evidenceRefs = selected.evidence.map((_, index) => `${selected.id}:evidence-${index}`);
      if (systemId === 'voyager_adapted') memory[selected.clue] = selected.id;
      if (systemId === 'darwin_godel_machine_adapted') {
        memory.preferredIndex = selected.evidence[0] >= 100 ? Number(selected.id.split('-')[1]) : 0;
      }
      return { answerId: selected.id, evidenceRefs, actions: Math.min(request.budget, 1 + selected.evidence.length) };
    }
  });
}

const SYSTEM_IDS = Object.freeze([
  'genos_ett_full', 'genos_no_endogenous_thought', 'genos_no_persistent_memory',
  'react_classic', 'periodic_llm_loop', 'voyager_adapted',
  'ai_scientist_v2_adapted', 'darwin_godel_machine_adapted'
]);

module.exports = { SYSTEM_IDS, createAdapter };
