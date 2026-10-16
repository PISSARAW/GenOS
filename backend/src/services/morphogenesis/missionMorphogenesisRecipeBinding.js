'use strict';

function proposedRecipe(policy) {
  const recipe = policy?.decision?.recipe;
  const ranking = policy?.portfolio?.ranking?.decision;
  return ranking?.decision === 'PROPOSE' && ranking.selectedId === recipe?.candidateId
    && ['TOPOLOGY', 'VARIANT'].includes(recipe.kind) ? recipe : null;
}

function recipeProfile(recipe) {
  return { baseTopology: recipe.topology,
    structuralVariants: recipe.variant ? [recipe.variant] : [] };
}

function recipePlanMismatch(plan, policy) {
  const recipe = proposedRecipe(policy);
  return Boolean(recipe && (plan?.selectedTopology !== recipe.topology
    || (plan?.selectedVariant || 'default') !== (recipe.variant || 'default')));
}

module.exports = { proposedRecipe, recipeProfile, recipePlanMismatch };
