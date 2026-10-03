'use strict';

const config = require('../config/orchestratorConfig');

function contractParallelism(contract) {
  if (!contract) return 1;
  const branches = Array.isArray(contract.branches) ? contract.branches.length : 1;
  return Math.max(1, branches);
}

function topologyWorkerCount(topology, variant = null) {
  if (topology === 'dispatch_trinity' && factorialVariant(variant)) return 16;
  if (topology === 'dispatch_trinity') return 3;
  if (topology === 'dispatch_team') return 2;
  if (topology === 'dispatch_biological') return 2;
  if (topology === 'dispatch_worker') return 1;
  return 1;
}

function computeRequiredCapacity(input = {}) {
  const { contract, topology, teamMembers, variantId, experimentalDesign } = input;
  const fromBranches = contractParallelism(contract);
  const fromTopology = topologyWorkerCount(topology, experimentalDesign?.worldTopology || variantId);
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
  const minimumTrinity = factorialVariant(input.experimentalDesign?.worldTopology || input.variantId) ? 16 : 3;
  if (input.topology === 'dispatch_trinity' && capacity < minimumTrinity) {
    if (analysis.systemMax >= minimumTrinity) {
      capacity = minimumTrinity;
      rationale = `Trinity design requires ${minimumTrinity} workers; capacity reserved for its execution.`;
    } else {
      rationale = `Trinity design requires ${minimumTrinity} workers but system max is ${analysis.systemMax}; dispatch must escalate.`;
    }
  }
  return { ...analysis, capacity, adapted, rationale };
}

function factorialVariant(value) {
  return ['factorial', 'factorial_grid', 'trinity-factorial', 'trinity_factorial']
    .includes(String(value || '').trim().toLowerCase());
}

module.exports = { computeRequiredCapacity, decideGarageCapacity, contractParallelism, topologyWorkerCount };
