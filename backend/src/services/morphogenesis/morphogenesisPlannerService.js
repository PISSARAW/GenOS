'use strict';

const { getPhenotype } = require('../agents/phenotypeRegistryService');
const { contractFor, missingCapabilities } = require('../topologyCapabilityService');
const { capabilityToolSet } = require('../toolLeasePolicy');
const { planGenotypeActions, planEpigeneticChanges, planPlasmidActions } = require('./morphogenesisPlanActions');

function phenotypeFitnessForTopology(phenotypeId, contract) {
  const phenotype = getPhenotype(phenotypeId);
  if (!phenotype) return { fit: false, score: 0, missing: contract.required || [] };
  const required = contract.required || [];
  const owned = new Set(phenotype.capabilities || []);
  const missing = required.filter((c) => !owned.has(c));
  return { fit: missing.length === 0, score: missing.length === 0 ? 1 : (required.length - missing.length) / required.length, missing };
}

function diffTopology(current, target) {
  const changes = [];
  if (current.mode !== target.mode) changes.push({ field: 'mode', from: current.mode, to: target.mode });
  if (current.organization !== target.organization) changes.push({ field: 'organization', from: current.organization, to: target.organization });
  if (current.topology !== target.topology) changes.push({ field: 'topology', from: current.topology, to: target.topology });
  return changes;
}

function classifyAgents(agents, targetTopology) {
  const result = { compatible: [], incompatible: [] };
  for (const agent of agents) {
    const fitness = phenotypeFitnessForTopology(agent.phenotype, contractFor(targetTopology));
    if (fitness.fit) result.compatible.push(agent);
    else result.incompatible.push({ agent, missing: fitness.missing });
  }
  return result;
}

function planSpawns(missingCapabilities, targetTopology, budget) {
  const spawns = [];
  const contract = contractFor(targetTopology);
  for (const cap of missingCapabilities) {
    spawns.push({ phenotype: targetTopology, capabilities: [cap], budget: budget / Math.max(1, missingCapabilities.length) });
  }
  return spawns;
}

function computeBudgetReallocation(agents, newAgents, totalBudget) {
  const perAgent = totalBudget / Math.max(1, agents.length + newAgents.length);
  return { perAgent, totalAllocated: perAgent * (agents.length + newAgents.length) };
}

function buildTransitionSequence(preserve, retire, spawn, rebind) {
  const sequence = [];
  for (const a of retire) sequence.push({ step: 'retire', agentId: a.agentId, action: 'terminate' });
  for (const s of spawn) sequence.push({ step: 'spawn', phenotype: s.phenotype, action: 'incarnate' });
  for (const r of rebind) sequence.push({ step: 'rebind', agentId: r.agentId, action: 'reassign' });
  for (const p of preserve) sequence.push({ step: 'preserve', agentId: p.agentId, action: 'keep' });
  return sequence;
}

function assemblePlan(components) {
  return {
    fromVersion: components.fromVersion,
    reason: components.reason,
    topologyChanges: components.topologyChanges,
    preserveAgents: components.preserve,
    retireAgents: components.retire,
    spawnAgents: components.spawn,
    rebindAgents: components.rebind,
    capabilityChanges: components.capabilityChanges,
    budgetReallocation: components.budget,
    expectedBenefit: components.expectedBenefit,
    expectedCost: components.expectedCost,
    transitionSequence: components.sequence
  };
}

function buildContracts(ctx) {
  const targetTopology = ctx.proposedTopology || 'specialist_expert_committee';
  const contracts = { pc: contractFor(targetTopology), required: contractFor(targetTopology).required || [] };
  contracts.missing = missingCapabilities(ctx.currentState, contracts.pc);
  return contracts;
}

function buildPlanComponents(ctx, contracts) {
  const agents = ctx.currentState && ctx.currentState.agents ? Array.from(ctx.currentState.agents.values()) : [];
  const classified = classifyAgents(agents, ctx.proposedTopology || 'specialist_expert_committee');
  const spawnList = planSpawns(contracts.missing, ctx.proposedTopology || 'specialist_expert_committee', ctx.budget || 0);
  const budget = computeBudgetReallocation(classified.compatible, spawnList, ctx.budget || 0);
  const sequence = buildTransitionSequence(classified.compatible, classified.incompatible.map((x) => x.agent), spawnList, []);
  const fromVersion = ctx.currentState ? ctx.currentState.currentMorphologyVersion || 0 : 0;
  const topologyChanges = diffTopology(ctx.currentState || {}, { mode: ctx.proposedTopology || 'specialist_expert_committee' });
  return {
    fromVersion,
    reason: ctx.reason || 'morphogenesis',
    topologyChanges,
    preserve: classified.compatible,
    retire: classified.incompatible.map((x) => x.agent),
    spawn: spawnList,
    rebind: [],
    capabilityChanges: contracts.missing.map((cap) => ({ capability: cap, action: 'acquire' })),
    budget,
    expectedBenefit: contracts.missing.length > 0 ? 0.7 : 0.3,
    expectedCost: { tokens: spawnList.length * 1000, latency: spawnList.length * 5000, risk: 0.3 },
    sequence
  };
}

function generateRollbackPlan(plan) {
  const rev = [];
  if (plan.retireAgents) {
    for (const a of plan.retireAgents) {
      rev.push({ agentId: a.agentId, estimatedDurationMs: 1000, action: 'reincarnate' });
    }
  }
  if (plan.spawnAgents) {
    for (const s of plan.spawnAgents) {
      rev.push({ phenotype: s.phenotype, estimatedDurationMs: 2000, action: 'terminate' });
    }
  }
  return {
    restoreActions: {
      retired: plan.retireAgents ? plan.retireAgents.map((a) => ({ agentId: a.agentId, action: 'reincarnate', phenotype: a.phenotype })) : [],
      spawned: plan.spawnAgents ? plan.spawnAgents.map((s, i) => ({ idx: i, action: 'terminate', phenotype: s.phenotype })) : [],
      rebound: plan.rebindAgents ? plan.rebindAgents.map((a) => ({ agentId: a.agentId, action: 'restore_assignment', phenotype: a.phenotype })) : []
    },
    estimatedRollbackCost: Math.ceil(plan.expectedCost && plan.expectedCost.tokens * 0.6) || 0,
    rollbackLatency: rev.reduce((sum, x) => sum + (x.estimatedDurationMs || 0), 0)
  };
}

function planMorphogenesis(ctx) {
  const contracts = buildContracts(ctx);
  const components = buildPlanComponents(ctx, contracts);
  const targetAgents = components.preserve.concat(components.rebind).map((a) => ({ id: a.agentId, capabilities: (getPhenotype(a.phenotype) || {}).capabilities || [] }));
  const plan = assemblePlan(components);
  plan.genotypeActions = planGenotypeActions({ requiredCapabilities: contracts.pc.required || [], availableGenomes: ctx.availableGenomes || [], targetAgents, db: ctx.db });
  plan.epigeneticChanges = planEpigeneticChanges({ agentStates: ctx.currentState && ctx.currentState.agents ? Array.from(ctx.currentState.agents.values()) : [], pressure: ctx.pressure || 0, evidence: ctx.evidence || [] });
  plan.plasmidActions = planPlasmidActions({ requiredCapabilities: contracts.pc.required || [], availablePlasmids: ctx.availablePlasmids || [], targetAgents });
  plan.rollbackPlan = generateRollbackPlan(plan);
  return plan;
}

function validatePlan(ctx) {
  const plan = ctx.plan;
  const errors = [];
  if (!plan.topologyChanges || plan.topologyChanges.length === 0) errors.push('no topology changes');
  if (!plan.spawnAgents || plan.spawnAgents.length === 0) errors.push('no spawn agents planned');
  if (!plan.rollbackPlan) errors.push('no rollback plan');
  return { valid: errors.length === 0, errors };
}

function estimateCost(plan) {
  return plan.expectedCost || { tokens: 0, latency: 0, risk: 0 };
}

module.exports = { planMorphogenesis, validatePlan, estimateCost, generateRollbackPlan, phenotypeFitnessForTopology, diffTopology, classifyAgents, planSpawns, computeBudgetReallocation, buildTransitionSequence, planGenotypeActions, planEpigeneticChanges, planPlasmidActions };
