'use strict';

const { getPhenotype } = require('../agents/phenotypeRegistryService');
const { contractFor, missingCapabilities } = require('../topologyCapabilityService');
const { capabilityToolSet } = require('../toolLeasePolicy');
const { planGenotypeActions, planEpigeneticChanges, planPlasmidActions } = require('./morphogenesisPlanActions');
const { buildIdentityExtensions } = require('./morphogenesisPlanIdentity');
const { annotatePlanWithSubstrates } = require('../../storage/compute/computeSubstrateResolver');
const { extendPlan } = require('./morphogenesisPlanExtensions');
const controlLoop = require('./cognitiveControlLoopService');
const { compileFlatTopology } = require('./graph/compileFlatTopology');
const biocenoseMorphogenesisAdapter = require('../biocenose/integration/biocenoseMorphogenesisAdapter');

function contractForTopology(topology) {
  return contractFor({ mode: topology, organization: topology });
}

function candidateFor(topology, contracts, cost) {
  const base = { topology, requiredCapabilities: contracts.pc.required || [] };
  base.tokenCost = cost && cost.tokens ? Math.min(1, cost.tokens / 10000) : 0.2;
  base.latency = cost && cost.latency ? Math.min(1, cost.latency / 30000) : 0.2;
  base.transitionCost = 0.1;
  base.coordinationCost = topology === 'trinity' ? 0.4 : 0.15;
  base.risk = 0.2;
  base.exploratory = topology === 'rhizome';
  base.evidenceOriented = topology === 'trinity';
  base.stabilizing = topology === 'specialist_expert_committee';
  return base;
}

function selectTopology(ctx, contracts, cost) {
  const expression = ctx.expression;
  if (!expression) return { topology: ctx.proposedTopology, receipt: null };
  const current = (ctx.currentState && ctx.currentState.topology) || 'team';
  const proposed = ctx.proposedTopology || 'specialist_expert_committee';
  const set = [current, proposed, 'trinity'].filter((v, i, a) => a.indexOf(v) === i);
  const candidates = set.map((topo) => candidateFor(topo, contracts, cost));
  try {
    const decision = controlLoop.decideMorphology({ expression, candidates });
    if (decision && decision.chosen) return { topology: decision.chosen.topology, receipt: decision.receipt };
  } catch (_) {
    return { topology: proposed, receipt: null };
  }
  return { topology: proposed, receipt: null };
}

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
  const contract = contractForTopology(targetTopology);
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

function availableCapsOf(state) {
  if (!state) return [];
  if (Array.isArray(state)) return state;
  if (Array.isArray(state.capabilities)) return state.capabilities;
  const agents = state.agents;
  if (!agents) return [];
  const list = agents instanceof Map ? Array.from(agents.values()) : agents;
  if (!Array.isArray(list)) return [];
  return list.flatMap((a) => a.capabilities || []);
}

function buildContracts(ctx) {
  const targetTopology = ctx.proposedTopology || 'specialist_expert_committee';
  const pc = contractForTopology(targetTopology);
  const contracts = { pc, required: pc.required || [] };
  contracts.missing = missingCapabilities(contracts.pc, availableCapsOf(ctx.currentState));
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

function scoreCognitiveFit(morphology, cognitivePhenotype) {
  if (!cognitivePhenotype) return 0;
  const requiredCaps = morphology.requiredCapabilities || [];
  const phenotypeCaps = cognitivePhenotype.capabilities || [];
  if (requiredCaps.length === 0) return 0.5;
  const owned = new Set(phenotypeCaps);
  const covered = requiredCaps.filter((c) => owned.has(c)).length;
  return covered / requiredCaps.length;
}

function scoreStrategyFit(morphology, strategyTrajectory) {
  if (!strategyTrajectory) return 0;
  const currentPhase = strategyTrajectory.currentPhase || 'explore';
  const morphologyPhase = morphology.preferredPhase || 'any';
  if (morphologyPhase === 'any') return 0.5;
  return morphologyPhase === currentPhase ? 1.0 : 0.2;
}

function scoreRegulatoryFit(morphology, regulatoryState) {
  if (!regulatoryState) return 0;
  const constraints = regulatoryState.constraints || [];
  const violations = constraints.filter((c) => c.blocks === morphology.topology);
  return violations.length === 0 ? 1.0 : Math.max(0, 1.0 - violations.length * 0.3);
}

function computeMorphologyUtility(ctx) {
  const { morphology, epistemicState, memoryContext, regulatoryState, cognitivePhenotype, strategyTrajectory } = ctx;
  const progress = (epistemicState && epistemicState.expectedProgress) || 0;
  const infoGain = (epistemicState && epistemicState.informationGain) || 0;
  const evidenceGain = (epistemicState && epistemicState.evidenceGain) || 0;
  const uncertaintyReduction = (epistemicState && epistemicState.uncertaintyReduction) || 0;
  const memoryReuse = memoryContext ? memoryContext.reuseScore || 0 : 0;
  const cognitiveFit = scoreCognitiveFit(morphology, cognitivePhenotype);
  const strategyFit = scoreStrategyFit(morphology, strategyTrajectory);
  const regulatoryFit = scoreRegulatoryFit(morphology, regulatoryState);
  const resilienceGain = regulatoryState ? regulatoryState.resilienceScore || 0 : 0;
  const tokenCost = morphology.tokenCost || 0;
  const latency = morphology.latency || 0;
  const transitionCost = morphology.transitionCost || 0;
  const coordinationCost = morphology.coordinationCost || 0;
  const risk = morphology.risk || 0;
  return progress + infoGain + evidenceGain + uncertaintyReduction + memoryReuse + cognitiveFit + strategyFit + regulatoryFit + resilienceGain - tokenCost - latency - transitionCost - coordinationCost - risk;
}

function planMorphogenesis(ctx) {
  const judgment = ctx.communityJudgment;
  const transition = biocenoseMorphogenesisAdapter.recommend({
    currentTopology: ctx.currentState?.topology,
    ...biocenoseMorphogenesisAdapter.signalsFromJudgment(judgment),
    ...(ctx.biocenoseSignals || {})
  });
  const adjusted = transition?.kind === 'TOPOLOGY_TRANSITION'
    ? { ...ctx, proposedTopology: transition.target, reason: transition.reason } : ctx;
  const plan = buildMorphogenesisPlan(adjusted);
  if (transition) plan.biocenoseTransition = {
    ...transition,
    communityId: judgment?.communityId || ctx.communityId || null,
    judgmentId: judgment?.judgmentId || null
  };
  return plan;
}

function buildMorphogenesisPlan(ctx) {
  const contracts = buildContracts(ctx);
  const components = buildPlanComponents(ctx, contracts);
  const targetAgents = components.preserve.concat(components.rebind).map((a) => ({ id: a.agentId, capabilities: (getPhenotype(a.phenotype) || {}).capabilities || [] }));
  const plan = assemblePlan(components);
  plan.genotypeActions = planGenotypeActions({ requiredCapabilities: contracts.pc.required || [], availableGenomes: ctx.availableGenomes || [], targetAgents, db: ctx.db });
  plan.epigeneticChanges = planEpigeneticChanges({ agentStates: ctx.currentState && ctx.currentState.agents ? Array.from(ctx.currentState.agents.values()) : [], pressure: ctx.pressure || 0, evidence: ctx.evidence || [] });
  plan.plasmidActions = planPlasmidActions({ requiredCapabilities: contracts.pc.required || [], availablePlasmids: ctx.availablePlasmids || [], targetAgents });
  Object.assign(plan, buildIdentityExtensions({ expression: ctx.expression || {}, problem: ctx.problem, event: ctx.event, checkpoint: ctx.checkpoint, ancestral: ctx.ancestral }));
  plan.rollbackPlan = generateRollbackPlan(plan);
  const selection = selectTopology(ctx, contracts, plan.expectedCost);
  plan.selectedTopology = selection.topology;
  const graph = compileFlatTopology({
    selectedTopology: selection.topology,
    missionId: ctx.missionId || ctx.problemId,
    mission: ctx.problem || ctx.mission,
    budget: ctx.budget,
    workers: targetAgents,
    rhizomeBranch: ctx.rhizomeBranch === true
  });
  plan.morphologyGraphRef = { graphId: graph.graphId, version: graph.version };
  plan.morphologyPatch = { operation: 'replace_root', graph };
  plan.controlReceipt = selection.receipt;
  const utilityCtx = {
    morphology: { requiredCapabilities: contracts.pc.required || [], topology: ctx.proposedTopology || 'specialist_expert_committee', tokenCost: plan.expectedCost ? plan.expectedCost.tokens : 0, latency: plan.expectedCost ? plan.expectedCost.latency : 0, transitionCost: plan.expectedCost ? plan.expectedCost.risk : 0, coordinationCost: 0, risk: plan.expectedCost ? plan.expectedCost.risk : 0 },
    epistemicState: ctx.epistemicState,
    memoryContext: ctx.memoryContext,
    regulatoryState: ctx.regulatoryState,
    cognitivePhenotype: ctx.cognitivePhenotype,
    strategyTrajectory: ctx.strategyTrajectory
  };
  plan.utility = computeMorphologyUtility(utilityCtx);
  extendPlan({ plan, reason: components.reason, pressures: ctx.pressure });
  // Compute Substrate Resolver: annotate each step with the optimal substrate
  // based on action type and current load. Falls back to CPU if DB unavailable.
  try {
    annotatePlanWithSubstrates(plan);
  } catch (err) {
    plan.substrateAnnotation = false;
    plan.substrateError = err.message;
  }
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

module.exports = { planMorphogenesis, validatePlan, estimateCost, generateRollbackPlan, phenotypeFitnessForTopology, diffTopology, classifyAgents, planSpawns, computeBudgetReallocation, buildTransitionSequence, planGenotypeActions, planEpigeneticChanges, planPlasmidActions, annotatePlanWithSubstrates, computeMorphologyUtility, selectTopology, candidateFor, contractForTopology };
