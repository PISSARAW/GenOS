'use strict';

const { runMorphogenesisRuntime } = require('./morphogenesisRuntimeV2');
const { checkMorphologyTypes } = require('../typing/morphologyTypeChecker');
const { createTopologyRegistry } = require('../registry/topologyRegistry');

function observe(context) {
  return context.morphogenesisPlan || null;
}

function diagnose(input) {
  const plan = input.observation || {};
  return {
    selectedTopology: plan.selectedTopology || null,
    candidateCount: Array.isArray(plan.candidateMorphologies) ? plan.candidateMorphologies.length : 0,
    utility: Number.isFinite(plan.utility) ? plan.utility : null
  };
}

function generateNeeds(input) {
  const plan = input.observation || {};
  return { plan, diagnosis: input.diagnosis, requiredCapabilities: plan.morphologyPatch?.graph?.nodes?.[0]?.capabilities || [] };
}

function synthesize(input) {
  const plan = input.needs.plan || {};
  return {
    decision: 'APPLY',
    graph: plan.morphologyPatch?.graph || null,
    rollbackPlan: plan.rollbackPlan || null,
    reason: plan.reason || 'shadow morphology preflight',
    transitionCost: Number(plan.expectedCost?.risk) || 0,
    expectedCost: plan.expectedCost || {},
    counterfactualRequired: false
  };
}

function typeCheck(proposal) {
  const registry = createTopologyRegistry();
  const contracts = Object.fromEntries(registry.list().map((id) => [id, registry.get(id)]));
  return checkMorphologyTypes(proposal.graph, contracts);
}

function hardGate(input) {
  const graph = input.proposal.graph;
  const plan = input.context.morphogenesisPlan || {};
  const budget = plan.morphologyPatch?.graph?.globalBudget;
  const maxTokens = typeof budget === 'number' ? budget : budget?.tokens;
  const tokenCost = Number(input.proposal.expectedCost.tokens) || 0;
  const errors = [];
  if (!plan.rollbackPlan) errors.push('rollback plan is missing');
  if (Number.isFinite(maxTokens) && tokenCost > maxTokens) errors.push('candidate exceeds its declared token budget');
  if (!graph || !graph.rootNodeId) errors.push('candidate graph has no root node');
  return { passed: errors.length === 0, scope: 'shadow_preflight_only', errors };
}

function paretoEvaluate(input) {
  const plan = input.context.morphogenesisPlan || {};
  const topologies = (plan.candidateMorphologies || []).map((candidate) => candidate.topology);
  const accepted = topologies.includes(input.proposal.graph?.nodes?.[0]?.topology);
  return { accepted, mode: 'shadow_comparison', candidateCount: topologies.length, selectedUtility: plan.utility ?? null };
}

function createShadowServices() {
  return {
    observe,
    diagnose,
    generateNeeds,
    repairOrSynthesize: synthesize,
    typeCheck,
    hardGate,
    paretoEvaluate
  };
}

async function runMorphogenesisShadow(plan, options = {}) {
  return runMorphogenesisRuntime({
    mode: 'shadow',
    missionId: options.missionId || plan?.morphologyPatch?.graph?.missionId || null,
    morphogenesisPlan: plan
  }, createShadowServices());
}

module.exports = { createShadowServices, runMorphogenesisShadow };
