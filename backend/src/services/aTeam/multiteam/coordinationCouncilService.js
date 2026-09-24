'use strict';

function buildCoordinationCouncil(teams = [], options = {}) {
  const chair = options.chairTeamId || (teams[0] && teams[0].teamId) || null;
  return {
    chairTeamId: chair,
    participants: (Array.isArray(teams) ? teams : []).map((team) => team.teamId).filter(Boolean),
    cadence: options.cadence || 'at_contract_boundaries',
    decisionRule: options.decisionRule || 'evidence_and_acceptance_criteria',
    escalationPath: options.escalationPath || [chair].filter(Boolean)
  };
}

module.exports = { buildCoordinationCouncil };
