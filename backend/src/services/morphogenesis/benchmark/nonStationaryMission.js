'use strict';

const MISSION_STAGES = Object.freeze([
  { id: 'unknown_repository', signals: ['structure_unknownness'] },
  { id: 'multiple_hypotheses', signals: ['hypothesis_diversity'] },
  { id: 'cross_stack_patch', signals: ['functional_decomposability'] },
  { id: 'shared_implementation_state', signals: ['state_coupling'] },
  { id: 'security_disagreement', signals: ['independent_evidence'] },
  { id: 'provider_outage', signals: ['resource_disruption'] },
  { id: 'long_term_maintenance', signals: ['memory_reuse', 'lifecycle'] }
]);

function nonStationaryMission() {
  return MISSION_STAGES.map((stage, index) => ({ ...stage, step: index + 1 }));
}

module.exports = { MISSION_STAGES, nonStationaryMission };
