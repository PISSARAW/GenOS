'use strict';

const { getPhenotype } = require('../agents/phenotypeRegistryService');
const { contractFor, missingCapabilities } = require('../topologyCapabilityService');
const { capabilityToolSet } = require('../toolLeasePolicy');

function phenotypeFitnessForTopology(phenotypeId, contract) {
  const phenotype = getPhenotype(phenotypeId);
  if (!phenotype) return { fit: false, score: 0, missing: contract.required || [] };
  const required = contract.required || [];
  const owned = new Set(phenotype.capabilities || []);
  const missing = required.filter((cap) => !owned.has(cap));
  const penalty = computePenalty(phenotype.authorityProfile || {}, contract.profile || {});
  const score = required.length === 0 ? 0.5 : Math.max(0, 1 - missing.length / required.length - penalty);
  return { fit: missing.length === 0 && penalty < 0.3, score, missing };
}

function computePenalty(auth, needs) {
  let penalty = 0;
  if (needs.communication === 'broadcast' && !auth.broadcast) penalty += 0.3;
  if (needs.budget === 'pooled' && !auth.delegate) penalty += 0.2;
  return penalty;
}

function safeField(obj, key) {
  return obj && obj[key] || null;
}

function diffTopology(current, proposed) {
  const cs = current && current.topologyState || {};
  const pm = proposed || {};
  const fromMode = safeField(cs, 'mode');
  const toMode = safeField(pm, 'mode');
  const fromOrg = safeField(cs, 'organization');
  const toOrg = safeField(pm, 'organization');
  return { modeChanged: fromMode !== toMode, organizationChanged: fromOrg !== toOrg, fromMode, toMode, fromOrganization: fromOrg, toOrganization: toOrg };
}

function classifyAgent(agent, contract) {
  const c = phenotypeFitnessForTopology(agent.phenotype, contract);
  if (c.fit) return { type: 'preserve', data: { agentId: agent.id, phenotype: agent.phenotype, score: c.score } };
  if (c.score > 0.3) return { type: 'rebind', data: { agentId: agent.id, phenotype: agent.phenotype, missing: c.missing, score: c.score } };
  return { type: 'retire', data: { agentId: agent.id, phenotype: agent.phenotype, reason: c.missing.length > 0 ? 'incompatible_capabilities' : 'insufficient_authority' } };
}

function classifyAgents(agents, contract) {
  const result = { preserve: [], retire: [], rebind: [] };
  for (const agent of agents) {
    const entry = classifyAgent(agent, contract);
    result[entry.type].push(entry.data);
  }
  return result;
}

const CAPABILITY_RULES = [
  { caps: ['STRATEGY_PORTFOLIO', 'TOPOLOGY'], phenotype: 'Orchestrator' },
  { caps: ['EVIDENCE_BARRIER', 'EPISTEMICS_BRIER'], phenotype: 'Verifier' },
  { caps: ['PROVENANCE', 'GRAPH_MEMORY'], phenotype: 'Specialist' },
  { caps: ['SIGNALING_BUS', 'LIGAND_RECEPTOR'], phenotype: 'SubOrchestrator' }
];

function selectPhenotypeForCapabilities(caps) {
  if (!caps || caps.length === 0) return 'AdaptiveWorker';
  const capSet = new Set(caps);
  for (const rule of CAPABILITY_RULES) {
    if (rule.caps.some((c) => capSet.has(c))) return rule.phenotype;
  }
  return 'AdaptiveWorker';
}

function planSpawns(contract, agents) {
  const missing = missingCapabilities(contract, agents.flatMap((a) => {
    const p = getPhenotype(a.phenotype);
    return p ? p.capabilities || [] : [];
  }));
  if (missing.length === 0) return [];
  const pheno = selectPhenotypeForCapabilities(missing);
  return [{ role: pheno === 'Orchestrator' ? 'orchestrator' : 'worker', phenotype: pheno, capabilities: missing, lease: capabilityToolSet(missing), reason: 'fills_capability_gap', priority: 'critical' }];
}

function computeBudgetReallocation(ctx, classification, spawns) {
  const cb = ctx.currentState && ctx.currentState.budgets || { total: 0, allocated: 0, remaining: 0, perAgent: {} };
  const b = ctx.budget || {};
  const rs = classification.retire.reduce((s, a) => s + ((cb.perAgent[a.agentId] && cb.perAgent[a.agentId].allocated) || 0), 0);
  const sc = spawns.length * (b.spawnCost || 500);
  const rc = classification.rebind.length * (b.rebindCost || 100);
  const nr = Math.max(0, (cb.remaining || 0) + rs - sc - rc);
  return { previousRemaining: cb.remaining || 0, retireSavings: rs, spawnCost: sc, rebindCost: rc, netChange: rs - sc - rc, newRemaining: nr };
}

function addPhase(phases, cfg) {
  if (cfg.count > 0) {
    phases.push({ order: phases.length + 1, action: cfg.action, description: cfg.desc, targets: cfg.targetFn(), rollbackAction: cfg.rollbackAction, estimatedDurationMs: cfg.count * cfg.durationMs });
  }
}

function buildTransitionSequence(c, s) {
  const p = [];
  addPhase(p, { count: c.retire.length, action: 'retire', desc: 'Terminate incompatible agents', targetFn: () => c.retire.map((a) => a.agentId), rollbackAction: 'restore', durationMs: 500 });
  addPhase(p, { count: s.length, action: 'spawn', desc: 'Incarnate new agents for missing capabilities', targetFn: () => s.map((x) => ({ phenotype: x.phenotype, role: x.role, capabilities: x.capabilities })), rollbackAction: 'terminate', durationMs: 2000 });
  addPhase(p, { count: c.rebind.length, action: 'rebind', desc: 'Migrate partially-compatible agents to new subgraphs', targetFn: () => c.rebind.map((a) => ({ agentId: a.agentId, phenotype: a.phenotype })), rollbackAction: 'restore_assignments', durationMs: 800 });
  addPhase(p, { count: c.preserve.length, action: 'preserve', desc: 'Maintain compatible agents', targetFn: () => c.preserve.map((a) => ({ agentId: a.agentId, phenotype: a.phenotype })), rollbackAction: 'none', durationMs: 200 });
  return p;
}

function computeRiskFactors(stats) {
  const rf = [];
  if (stats.s > 2) rf.push(0.3);
  if (stats.r > 3) rf.push(0.25);
  if (stats.b > 5) rf.push(0.2);
  if (stats.ops > 10) rf.push(0.15);
  return rf;
}

function estimateCostFromPlan(stats) {
  const tokens = (stats.r * 50) + (stats.s * 500) + (stats.b * 150) + (stats.p * 30);
  const latency = stats.ph.reduce((sum, x) => sum + (x.estimatedDurationMs || 0), 0);
  const ops = stats.r + stats.s + stats.b + stats.p;
  const rf = computeRiskFactors({ s: stats.s, r: stats.r, b: stats.b, ops });
  const risk = Math.min(1, rf.reduce((sum, x) => sum + x, 0.05));
  return { tokens, latency, risk: Number(risk.toFixed(3)), operationCount: ops, breakdown: { retireTokens: stats.r * 50, spawnTokens: stats.s * 500, rebindTokens: stats.b * 150, preserveTokens: stats.p * 30 } };
}

function safeArrayCount(arr) {
  return arr && arr.length || 0;
}

function estimateCost(plan) {
  if (!plan) return { tokens: 0, latency: 0, risk: 1 };
  const ph = plan.transitionSequence || [];
  return estimateCostFromPlan({ r: safeArrayCount(plan.retireAgents), s: safeArrayCount(plan.spawnAgents), b: safeArrayCount(plan.rebindAgents), p: safeArrayCount(plan.preserveAgents), ph });
}

function buildContracts(ctx) {
  const cs = ctx.currentState;
  const pt = ctx.proposedTopology;
  const currentTopo = cs.topologyState || {};
  return {
    cc: contractFor({ mode: currentTopo.mode, organization: currentTopo.organization }),
    pc: contractFor({ mode: pt.mode, organization: pt.organization })
  };
}

function buildPlanComponents(ctx, contracts) {
  const td = diffTopology(ctx.currentState, ctx.proposedTopology);
  const agents = Array.from(ctx.currentState.agents ? ctx.currentState.agents.values() : []);
  const cls = classifyAgents(agents, contracts.pc);
  const spawns = contracts.pc.required && contracts.pc.required.length > 0 ? planSpawns(contracts.pc, agents) : [];
  const phases = buildTransitionSequence(cls, spawns);
  const budget = computeBudgetReallocation(ctx, cls, spawns);
  const cost = estimateCostFromPlan({ r: cls.retire.length, s: spawns.length, b: cls.rebind.length, p: cls.preserve.length, ph: phases });
  return { td, cls, spawns, contracts, phases, budget, cost, agentCount: agents.length };
}

function assemblePlan(c) {
  return {
    version: '1.0', createdAt: new Date().toISOString(), topoDiff: c.td,
    topologyChanges: { from: { mode: c.td.fromMode, organization: c.td.fromOrganization }, to: { mode: c.td.toMode, organization: c.td.toOrganization }, changed: c.td.modeChanged || c.td.organizationChanged },
    preserveAgents: c.cls.preserve, retireAgents: c.cls.retire, spawnAgents: c.spawns, rebindAgents: c.cls.rebind,
    capabilityChanges: { added: c.contracts.pc.required ? c.contracts.pc.required.filter((x) => !(c.contracts.cc.required || []).includes(x)) : [], removed: (c.contracts.cc.required || []).filter((x) => !(c.contracts.pc.required || []).includes(x)), leases: c.spawns.map((x) => ({ phenotype: x.phenotype, tools: x.lease })) },
    budgetReallocation: c.budget, transitionSequence: c.phases,
    expectedBenefit: { capabilityCoverage: 1, agentEfficiency: c.cls.preserve.length / Math.max(1, c.agentCount), riskReduction: c.cls.retire.length > 0 ? 0.3 : 0, estimatedValue: (c.cls.preserve.length * 100) + (c.spawns.length * 200) - (c.cls.retire.length * 50) },
    expectedCost: c.cost, rollbackPlan: null
  };
}

function planMorphogenesis(ctx) {
  if (!ctx || !ctx.currentState || !ctx.proposedTopology) throw new Error('planMorphogenesis requires ctx.currentState and ctx.proposedTopology');
  const contracts = buildContracts(ctx);
  const components = buildPlanComponents(ctx, contracts);
  const plan = assemblePlan(components);
  plan.rollbackPlan = generateRollbackPlan(plan);
  return plan;
}

function validatePlan(ctx) {
  if (!ctx || !ctx.plan) return { valid: false, errors: ['Missing plan'] };
  const errors = [];
  const warnings = [];
  validateStructure(ctx.plan, errors);
  errors.push(...checkConstraints(ctx.plan, ctx.constraints));
  warnings.push(...checkRiskWarnings(ctx.plan));
  return { valid: errors.length === 0, errors, warnings };
}

function validateStructure(plan, errors) {
  if (!plan.topologyChanges) errors.push('Missing topologyChanges');
  if (!plan.transitionSequence || plan.transitionSequence.length === 0) errors.push('Empty transitionSequence');
}

function checkConstraints(plan, constraints) {
  if (!constraints) return [];
  const errors = [];
  if (exceedsLimit(plan.retireAgents, constraints.maxRetire)) errors.push('Retire count exceeds max');
  if (exceedsLimit(plan.spawnAgents, constraints.maxSpawn)) errors.push('Spawn count exceeds max');
  if (belowMinimum(plan.preserveAgents, constraints.minPreserve)) errors.push('Preserve count below min');
  if (exceedsBudgetImpact(plan, constraints.maxBudgetImpact)) errors.push('Budget impact exceeds limit');
  return errors;
}

function exceedsLimit(arr, max) {
  return Boolean(max && arr && arr.length > max);
}

function belowMinimum(arr, min) {
  return Boolean(min && arr && arr.length < min);
}

function exceedsBudgetImpact(plan, limit) {
  const budget = plan.budgetReallocation;
  return Boolean(limit && budget && budget.netChange < -limit);
}

function checkRiskWarnings(plan) {
  const warnings = [];
  const risk = plan.expectedCost && plan.expectedCost.risk;
  if (risk > 0.8) warnings.push('High risk transition (>0.8)');
  const retired = plan.retireAgents && plan.retireAgents.length || 0;
  const preserved = plan.preserveAgents && plan.preserveAgents.length || 0;
  if (retired > preserved * 2) warnings.push('Disproportionate retirement ratio');
  return warnings;
}

function buildReversePhases(transitionSequence) {
  return [...transitionSequence].reverse().map((ph, i) => ({ order: i + 1, action: ph.rollbackAction, originalAction: ph.action, description: 'Rollback: ' + ph.rollbackAction + ' for phase ' + ph.order, targets: ph.targets, estimatedDurationMs: ph.estimatedDurationMs })).filter((x) => x.action !== 'none');
}

function generateRollbackPlan(plan) {
  if (!plan) return null;
  const rev = buildReversePhases(plan.transitionSequence || []);
  const rb = plan.budgetReallocation ? { netChange: -(plan.budgetReallocation.netChange), restoredAmount: plan.budgetReallocation.newRemaining } : null;
  return {
    version: '1.0', createdAt: new Date().toISOString(),
    triggerConditions: ['transition_failure_rate > 0.3', 'capability_degradation > 0.2', 'budget_exhaustion', 'manual_rollback_request'],
    reverseSequence: rev, budgetRestore: rb,
    restoreActions: {
      retired: plan.retireAgents ? plan.retireAgents.map((a) => ({ agentId: a.agentId, action: 'reincarnate', phenotype: a.phenotype })) : [],
      spawned: plan.spawnAgents ? plan.spawnAgents.map((s, i) => ({ idx: i, action: 'terminate', phenotype: s.phenotype })) : [],
      rebound: plan.rebindAgents ? plan.rebindAgents.map((a) => ({ agentId: a.agentId, action: 'restore_assignment', phenotype: a.phenotype })) : []
    },
    estimatedRollbackCost: Math.ceil(plan.expectedCost && plan.expectedCost.tokens * 0.6) || 0,
    rollbackLatency: rev.reduce((sum, x) => sum + (x.estimatedDurationMs || 0), 0)
  };
}

module.exports = { planMorphogenesis, validatePlan, estimateCost, generateRollbackPlan, phenotypeFitnessForTopology, diffTopology, classifyAgents, planSpawns, computeBudgetReallocation, buildTransitionSequence };
