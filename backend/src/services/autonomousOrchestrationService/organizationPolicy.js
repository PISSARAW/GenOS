const { ORGANIZATIONS } = require('../dynamicOrganizationService');
const { organizationTransitions } = require('../autonomousOrchestrationGates');

function collectiveId(contract) {
  return (contract.strategy_portfolio || []).find((strategy) => strategy.family === 'collective')?.id || 'network_silence';
}

function resolveOrganization(contract, security) {
  return security ? 'red_blue_coevolution' : collectiveId(contract);
}

function buildOrganizationPolicy(contract, security) {
  return {
    initial: resolveOrganization(contract, security),
    authority: 'orchestrator_may_change_at_any_decision_gate',
    availableOrganizations: Object.keys(ORGANIZATIONS),
    communicationModes: [...new Set(Object.values(ORGANIZATIONS).map((entry) => entry.exchange))],
    transitions: organizationTransitions()
  };
}

module.exports = { resolveOrganization, buildOrganizationPolicy };