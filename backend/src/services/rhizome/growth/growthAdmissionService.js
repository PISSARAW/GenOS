'use strict';

const planner = require('./growthPlanner');
const budgets = require('./growthBudgetService');
const capabilityGraph = require('../graph/capabilityGraphService');
const admission = require('../security/capabilityAdmissionService');
const limits = require('./growthLimitsService');
const { normalizeCapabilityEdge } = require('../contracts/capabilityEdge');

function fail(code, message) { throw Object.assign(new Error(message), { code }); }

function validatePlan(session, input) {
  if (!Number.isInteger(input.expectedGraphVersion) || input.expectedGraphVersion !== session.graphVersion) {
    fail('RHIZOME_GROWTH_STALE', 'Growth candidate was planned against a stale graph.');
  }
  const plan = input.growthPlan;
  const gap = session.openGaps.find(item => item.gapId === plan?.gapId);
  if (!gap || plan.candidate?.candidateId !== input.candidateId) {
    fail('RHIZOME_GROWTH_PLAN_REQUIRED', 'Admission requires the current gap and selected growth plan.');
  }
  const checked = planner.plan({ session, gap, values: [plan.candidate], options: { threshold: Math.max(session.variantPolicy?.growth?.threshold || 0, plan.threshold || 0) } });
  if (!checked.permitted) fail('RHIZOME_GROWTH_REJECTED', checked.reason);
  if (input.proof?.candidateId !== input.candidateId || input.proof?.capability !== gap.missingCapability) {
    fail('RHIZOME_GROWTH_PROOF_MISMATCH', 'Growth proof must match the selected candidate and capability gap.');
  }
  return { candidate: checked.candidate, gap };
}

function apply(session, input, policy) {
  if (!Array.isArray(input.edges)) fail('RHIZOME_GROWTH_INVALID', 'Growth edges must be an array.');
  const { candidate, gap } = validatePlan(session, input);
  validateEdgeProof(input);
  const discovered = { ...input.node, state: 'DISCOVERED' };
  const active = limits.annotate(admission.admit(discovered, input.proof, policy), session, candidate);
  let updated = attachNode(session, discovered, candidate);
  for (const edge of input.edges) updated = capabilityGraph.addEdge(updated, edge);
  updated.nodes = updated.nodes.map(node => node.nodeId === active.nodeId ? active : node);
  updated.graphVersion += 1;
  const cost = candidate.creationCost + candidate.coordinationCost;
  const key = session.budgets.growth !== undefined ? 'growth' : 'default';
  updated.budgets = { ...session.budgets, [key]: (session.budgets[key] || 0) - cost };
  updated.openGaps = session.openGaps.filter(item => item.gapId !== gap.gapId);
  Object.assign(session, updated);
  return { sessionId: session.sessionId, node: active, graphVersion: session.graphVersion,
    charged: cost, remainingBudget: budgets.availableBudget(session) };
}

function attachNode(session, node, candidate) {
  const existing = session.nodes.find(item => item.nodeId === node.nodeId);
  if (!existing) return capabilityGraph.addNode({ ...session, nodes: [...session.nodes], edges: [...session.edges] }, node);
  const reusable = ['REUSE', 'RECONFIGURE', 'CONNECT', 'BRIDGE', 'ADAPT_PROCEDURE', 'WAKE_DORMANT'];
  if (!reusable.includes(candidate.action) || !candidate.targetNodeIds.includes(node.nodeId)) {
    fail('RHIZOME_GROWTH_TARGET_INVALID', 'Existing nodes require an explicit reusable growth target.');
  }
  return { ...session, nodes: [...session.nodes], edges: [...session.edges] };
}

function validateEdgeProof(input) {
  const contracts = input.proof?.edgeContracts || [];
  const normalized = input.edges.map(normalizeCapabilityEdge);
  if (JSON.stringify(contracts) !== JSON.stringify(normalized)) {
    fail('RHIZOME_GROWTH_EDGE_PROOF_REQUIRED', 'Growth edges must match the independently signed transport contracts.');
  }
}

module.exports = { apply };
