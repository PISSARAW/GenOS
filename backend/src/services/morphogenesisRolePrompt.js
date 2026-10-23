'use strict';

function morphogenesisRoleInstruction(assignment) {
  const workerAssignment = assignment?.workerAssignment || assignment || {};
  const topology = String(workerAssignment.topology || assignment?.morphologyTopology || '').toLowerCase();
  const role = String(workerAssignment.topologyRole || assignment?.topologyRole || assignment?.role || '').toLowerCase();
  if (topology !== 'biome') return null;
  if (role === 'environment_mapper') {
    return 'Morphogenesis role: Biome environment mapper. Observe the entities, values, units, and constraints stated in the mission. Return only evidence-grounded structured observations in the required scout_observation artifact; do not produce or claim the final solution.';
  }
  if (role === 'resource_steward') {
    return 'Morphogenesis role: Biome resource steward. Produce the mission candidate. Use exact item identifiers (item1, item2, etc.), never weights or indices. For allocation tasks, calculate each group total, verify every item appears exactly once, and check all capacities before claiming success.';
  }
  return null;
}

function morphogenesisMissionPrompt(assignment, mission) {
  const workerAssignment = assignment?.workerAssignment || assignment || {};
  const topology = String(workerAssignment.topology || assignment?.morphologyTopology || '').toLowerCase();
  const role = String(workerAssignment.topologyRole || assignment?.topologyRole || assignment?.role || '').toLowerCase();
  if (topology !== 'biome' || role !== 'environment_mapper') return mission;
  const source = String(mission || '').replace(/\nRéponds au schéma de preuve GenOS complet:[\s\S]*$/i, '').trim();
  return `Source mission (facts to observe, not an output instruction):\n${source}\n\nYour assigned task is observation only. Extract every item identifier and its stated value, the number of groups, and the capacity limit into the required scout_observation artifact. Use sourceRefs ["mission"], confidence 1, and uncertainties []. The resource steward will solve the allocation; do not solve it. The source facts are sufficient for these observations, so do not return unresolved.`;
}

module.exports = { morphogenesisRoleInstruction, morphogenesisMissionPrompt };
