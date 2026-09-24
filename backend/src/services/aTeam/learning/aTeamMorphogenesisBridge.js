'use strict';

function buildMorphologyCandidate(input = {}) {
  const graph = input.workGraph || {};
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const variants = Array.isArray(input.variants) ? input.variants : [];
  return {
    topology: 'a_team',
    requiredCapabilities: [...new Set(nodes.flatMap((node) => node.requiredCapabilities || []))],
    preferredPhase: input.preferredPhase || 'any',
    informationGain: unit(input.informationGain, 0.3),
    evidenceGain: unit(input.evidenceGain, 0.4),
    uncertaintyReduction: unit(input.uncertaintyReduction, 0.2),
    coordinationCost: Number(input.coordinationCost) || nodes.length,
    candidateVariants: variants,
    workGraphId: graph.workGraphId || null,
    evidenceIds: Array.isArray(input.evidenceIds) ? input.evidenceIds : []
  };
}

function planTeamMorphogenesis(input = {}) {
  const planner = require('../../morphogenesis/morphogenesisPlannerService');
  const context = input.morphologyContext || {};
  const variantPlan = require('../variants/variantRegistry').buildVariantPlan(input.mission || {});
  const plan = planner.planMorphogenesis({
    ...context,
    currentState: context.currentState || { topology: 'a_team', agents: new Map() },
    proposedTopology: 'a_team',
    reason: input.reason || 'a_team_adaptation',
    problem: input.mission || context.problem || context.mission,
    budget: input.budget ?? context.budget,
    aTeamVariant: variantPlan.variant
  });
  return { plan, variantPlan, candidate: buildMorphologyCandidate(input) };
}

function unit(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : fallback;
}

module.exports = { buildMorphologyCandidate, planTeamMorphogenesis };
