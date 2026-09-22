'use strict';

/**
 * Cognitive Key System — phénotype cognitif des workers (ADR 0033, point 4).
 *
 * Branche le CognitiveComposer dans le pipeline d'orchestration :
 *  - déduit les besoins cognitifs d'une mission (heuristique v1 : le
 *    vocabulaire usefulWhen matché dans le texte de mission) ;
 *  - compose UNE CognitiveRecipe par worker via le Composer ;
 *  - injecte le bloc phénotype dans le prompt du worker (instructions
 *    opérationnelles uniquement — jamais la provenance doctrinale) ;
 *  - attache la recette au membre du plan (aTeam/trinity) pour
 *    traçabilité, SANS toucher au génome.
 *
 * La cognition appartient au phénotype temporaire du worker : le génome
 * (agentEvolution/agentDna) n'est pas modifié, la recette vit dans
 * `assignment.cognitiveRecipe` et le prompt.
 *
 * Feature flag : GENOS_COGNITIVE_PHENOTYPE=1 (défaut off — opt-in,
 * prérequis pour le benchmark d'ablation du point 7).
 */

const { COGNITIVE_KEYS } = require('../cognition/cognitiveKeyDefinitions');
const { composeRecipe } = require('../cognition/cognitiveComposer');

const PHENOTYPE_HEADER = 'Cognitive phenotype for this mission (apply each operation in order):';

function phenotypeEnabled(env = process.env) {
  const value = String(env.GENOS_COGNITIVE_PHENOTYPE || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'on';
}

/**
 * Besoins cognitifs déduits de la mission : heuristique v1 par
 * correspondance exacte entre le vocabulaire usefulWhen du registre
 * et le texte de mission (normalisé : underscores = espaces).
 * Le profiling sémantique attend l'apprentissage des points 7/9.
 */
function inferCognitiveNeeds(missionText, keys = COGNITIVE_KEYS) {
  const text = String(missionText || '').toLowerCase();
  if (!text) return [];
  const vocabulary = new Set(keys.flatMap((key) => key.usefulWhen));
  return [...vocabulary]
    .filter((need) => text.includes(need.replace(/_/g, ' ')))
    .sort();
}

function recipeIdFor(index) {
  return `recipe.mission-worker-${index + 1}`;
}

function recipeLabelFor(member) {
  const label = member && member.label ? member.label : `worker-${(member && member.role) || 'default'}`;
  return `Phénotype cognitif — ${label}`;
}

/**
 * Compose le phénotype d'un worker : recette validée + bloc prompt.
 * Échoue doucement (phenotype: null) si la composition est invalide —
 * le worker part sans phénotype plutôt que sans mission.
 */
function buildWorkerPhenotype({ member, needs, index, options }) {
  const composition = composeRecipe({
    id: recipeIdFor(index),
    label: recipeLabelFor(member),
    needs,
    options
  });
  if (!composition.valid) return null;
  return {
    recipeId: composition.recipe.id,
    keys: composition.recipe.keys,
    instructions: phenotypeInstructions(composition.recipe.keys),
    metrics: composition.metrics,
    tensions: composition.metrics.tensions
  };
}

function keyInstructions(keyIds, keys = COGNITIVE_KEYS) {
  const byId = new Map(keys.map((key) => [key.id, key]));
  return keyIds
    .map((keyId) => byId.get(keyId))
    .filter(Boolean)
    .map((key) => ({ id: key.id, label: key.label, instruction: key.instruction }));
}

function phenotypeInstructions(keyIds) {
  return keyInstructions(keyIds);
}

/**
 * Bloc prompt injecté : header + une ligne par clé (label + instruction).
 * Volontairement compact — le budget prompt du worker est vérifié en
 * aval (validatePromptBudget).
 */
function formatPhenotypePrompt(phenotype) {
  if (!phenotype || !phenotype.instructions || phenotype.instructions.length === 0) {
    return null;
  }
  const lines = phenotype.instructions.map((entry) => `- ${entry.label}: ${entry.instruction}`);
  const tensions = (phenotype.tensions || []).map((pair) => `${pair.a} vs ${pair.b}`);
  const tensionLine = tensions.length
    ? [`Productive tensions to exploit (do not resolve prematurely): ${tensions.join('; ')}.`]
    : [];
  return [PHENOTYPE_HEADER, ...lines, ...tensionLine].join('\n');
}

/**
 * Attache les phénotypes à tous les membres actifs du plan.
 * La diversité d'équipe est garantie par exclusion cumulative : chaque
 * worker compose hors des clés déjà attribuées (les recettes se
 * recouvrent seulement si le registre est épuisé).
 * Retourne le nombre de membres phénotypés (0 si disabled).
 */
function attachPhenotypesToPlan({ plan, missionText, options }) {
  if (!phenotypeEnabled()) return { attached: 0, reason: 'disabled' };
  const needs = inferCognitiveNeeds(missionText);
  if (needs.length === 0) return { attached: 0, reason: 'no_needs_inferred' };
  const members = activeMembers(plan);
  const assignedKeys = new Set();
  members.forEach((member, index) => {
    const phenotype = buildWorkerPhenotype({
      member,
      needs,
      index,
      options: { ...(options || {}), excludeKeys: [...assignedKeys] }
    });
    if (phenotype) {
      member.cognitiveRecipe = phenotype;
      phenotype.keys.forEach((keyId) => assignedKeys.add(keyId));
    }
  });
  const attached = members.filter((member) => member.cognitiveRecipe).length;
  return { attached, needs, members: members.length };
}

/**
 * Membres actifs du plan : workers dispatchés (Trinity ou A-Team),
 * sinon liste vide — pas de phénotype pour un plan sans workers.
 */
function activeMembers(plan) {
  const workers = plan && plan.dispatchWorkers;
  return Array.isArray(workers) ? workers : [];
}

module.exports = {
  phenotypeEnabled,
  inferCognitiveNeeds,
  buildWorkerPhenotype,
  formatPhenotypePrompt,
  attachPhenotypesToPlan,
  activeMembers
};
