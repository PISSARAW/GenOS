'use strict';

// Trinity differentiation (ADR 0279): variants must change worlds, not labels.
// Pure functions: design -> per-world recipe, objective profile, attack role,
// mission text, diversity descriptors. No I/O, no dispatch.

const diversity = require('./trinityDiversityPlanner');
const pareto = require('./trinityParetoService');
const profiles = require('./trinityWorkerProfiles');

const BASE_RECIPES = ['direct', 'planned', 'self_correcting'];
const DIVERSE_RECIPES = ['direct', 'planned', 'adversarial'];
const PROFILE_KEYS = ['world1', 'world2', 'world3'];

const ATTACK_HYPOTHESIS = 'Attack the likely answers independently: produce typed falsifiable claims, counterexamples and refutations with reproducible evidence. Never promote a claim without cited evidence. Report evidenceVector as usual; use null for unmeasured dimensions.';

function recipeFor(design, index) {
  const list = design && design.diversityPolicy === 'heterogeneous' ? DIVERSE_RECIPES : BASE_RECIPES;
  return list[index] || 'direct';
}

function objectiveFor(design, index) {
  if (!design || design.objectivePolicy !== 'pareto_orthogonal') return null;
  return pareto.DEFAULT_OBJECTIVE_PROFILES[PROFILE_KEYS[index]] || null;
}

function attackFor(design, index) {
  return Boolean(design)
    && design.interactionPolicy === 'adversarial_cross_examination'
    && index === 2;
}

function familyOf(modelUri) {
  const name = String(modelUri || '').replace(/^[a-z]+:\/\//i, '');
  const head = (name.match(/^[a-z]+/i) || ['local'])[0].toLowerCase();
  return head;
}

function providerOf(modelUri) {
  const match = String(modelUri || '').match(/^([a-z]+):\/\//i);
  return match ? match[1].toLowerCase() : 'local';
}

function axisLine(objective) {
  if (!objective) return '';
  return ` Optimization axis: ${objective.name} ${JSON.stringify(objective.weights)}. Optimize for this axis; mission hard constraints still apply.`;
}

function recipeLine(recipe) {
  return ` Cognitive recipe: ${recipe}. Stay within this recipe; do not borrow another world's approach.`;
}

function missionText(ctx, member, tail) {
  return `Trinity mission: ${ctx.goal}\nDomain: ${ctx.domain}\nSealed chamber: ${member.chamber}\nWorld strategy: ${member.hypothesis}\nDo not request, read, or infer other chamber outputs. Return an artifact, acceptance checks, evidence, uncertainties, and execution limits.${recipeLine(tail.recipe)}${axisLine(tail.objective)}`;
}

function withAttack(member) {
  return {
    ...member,
    role: 'adversarial_reviewer',
    hypothesis: `${ATTACK_HYPOTHESIS}\nOriginal world brief and qualification constraints: ${member.hypothesis}`
  };
}

function differentiateOne(member, index, ctx) {
  const falsifier = attackFor(ctx.design, index) || (ctx.design?.diversityPolicy === 'heterogeneous' && index === 2);
  const based = falsifier ? withAttack(member) : member;
  const recipe = recipeFor(ctx.design, index);
  const objective = objectiveFor(ctx.design, index);
  return {
    ...based,
    worldNumber: index + 1,
    variantIndex: index,
    cognitiveRecipe: recipe,
    objectiveProfile: objective ? objective.name : null,
    mission: missionText(ctx, based, { recipe, objective })
  };
}

function differentiate(members, ctx) {
  const prepared = profiles.apply(members, ctx);
  const context = { ...ctx, domain: profiles.missionDomain(ctx) };
  return prepared.map((member, index) => differentiateOne(member, index, context));
}

function describeOne(member, index, models) {
  const uri = Array.isArray(models) ? models[index % models.length] : null;
  return {
    provider: uri ? providerOf(uri) : 'local',
    modelFamily: uri ? familyOf(uri) : 'local',
    cognitiveRecipe: member.cognitiveRecipe || 'direct',
    tools: [],
    lineage: `trinity/world${member.worldNumber || index + 1}`,
    agentId: `world${member.worldNumber || index + 1}`
  };
}

function diversityReceipt(members, models) {
  const worlds = members.map((member, index) => describeOne(member, index, models));
  const checked = diversity.validateDiversity(worlds);
  return {
    basis: 'requested_configuration', observedRuntimeVerified: false,
    worlds: worlds.map((world) => ({ provider: world.provider, modelFamily: world.modelFamily, cognitiveRecipe: world.cognitiveRecipe })),
    minPairwiseDiversity: checked.diversity.minPairwiseDiversity,
    threshold: checked.threshold,
    passes: checked.valid,
    warnings: checked.warnings
  };
}

module.exports = {
  recipeFor,
  objectiveFor,
  attackFor,
  familyOf,
  providerOf,
  differentiate,
  diversityReceipt
};
