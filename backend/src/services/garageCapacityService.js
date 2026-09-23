'use strict';

const config = require('../config/orchestratorConfig');

function contractParallelism(contract) {
  if (!contract) return 1;
  const branches = Array.isArray(contract.branches) ? contract.branches.length : 1;
  return Math.max(1, branches);
}

function topologyWorkerCount(topology) {
  if (topology === 'dispatch_trinity') return 3;
  if (topology === 'dispatch_team') return 2;
  if (topology === 'dispatch_biological') return 2;
  if (topology === 'dispatch_worker') return 1;
  return 1;
}

function computeRequiredCapacity(input = {}) {
  const { contract, topology, teamMembers } = input;
  const fromBranches = contractParallelism(contract);
  const fromTopology = topologyWorkerCount(topology);
  const fromTeam = Array.isArray(teamMembers) ? teamMembers.length : 0;
  const required = Math.max(fromBranches, fromTopology, fromTeam);
  const systemMax = config.maxActiveWorkers();
  return {
    required: Math.max(1, required),
    systemMax,
    sufficient: systemMax >= required,
    topology: topology || 'single_worker',
    contractBranches: fromBranches,
    teamMembers: fromTeam
  };
}

function decideGarageCapacity(input = {}) {
  const analysis = computeRequiredCapacity(input);
  let capacity = Math.min(analysis.required, analysis.systemMax);
  let adapted = false;
  let rationale = 'Capacity matches requirement.';
  if (analysis.sufficient) {
    capacity = analysis.required;
  } else {
    capacity = analysis.systemMax;
    adapted = true;
    rationale = `Required ${analysis.required} exceeds system max ${analysis.systemMax}; capped. Increase GENOS_MAX_ACTIVE_WORKERS to avoid adaptation.`;
  }
  if (input.topology === 'dispatch_trinity' && capacity < 3) {
    capacity = 3;
    rationale = 'Trinity requires exactly 3 workers; capacity overridden to 3.';
  }
  return { ...analysis, capacity, adapted, rationale };
}

module.exports = { computeRequiredCapacity, decideGarageCapacity, contractParallelism, topologyWorkerCount };
