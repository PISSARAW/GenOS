'use strict';

/**
 * Cognitive Key System — confrontation & synthèse cognitive (ADR 0033, point 6).
 *
 * Troisième barrier du workerEvidenceBarrier, à côté de Trinity
 * (comparaison de mondes) et A-Team (arbitration d'intégration) :
 * confronte les analyses produites sous des CognitiveRecipes
 * DIFFÉRENTES et synthétise.
 *
 * La confrontation n'est pas un vote : les workers pensés différemment
 * produisent des analyses incompatibles, et c'est l'information
 * précieuse. Le service :
 *  1. collecte les dossiers workers porteurs d'une recette cognitive
 *     (phenotype attaché au prompt → traçable dans le worker) ;
 *  2. confronte : pour chaque tension inter-recettes déclarée
 *     (crossTensions du portfolio), identifie les positions opposées
 *     réellement exprimées dans les dossiers ;
 *  3. synthétise selon l'opération perspective-reconciliation :
 *     conditions de validité de chaque analyse, niveau de description
 *     où elles se tiennent ensemble, résidu irréconciliable explicite ;
 *  4. expose la décision sur le plan (cognitiveSynthesis) et émet
 *     COGNITIVE_SYNTHESIS_COMPLETED.
 *
 * La synthèse est structurelle (métriques + positions), pas générative :
 * aucun LLM ici — les conditions de validité sont extraites des
 * dossiers (claims/tests/uncertainties), pas réécrites. La synthèse
 * rédactionnelle, si nécessaire, appartient à l'orchestrateur en aval.
 */

const { emit } = require('./agentOrchestrationState');
const { latestReport } = require('./trinityComparativeBarrier');
const recipeMemory = require('./cognitiveRecipeMemoryService');

const MAX_TENSIONS = 8;

function workerRecipe(worker) {
  const recipe = worker && worker.cognitiveRecipe;
  if (!recipe || !Array.isArray(recipe.keys) || recipe.keys.length === 0) return null;
  return recipe;
}

function dossierPosition(dossier) {
  const report = latestReport(dossier) || {};
  return {
    workerId: dossier.workerId || null,
    role: dossier.role || dossier.subSystem || null,
    recipeId: dossier.recipeId || null,
    outcome: report.outcome || 'no_evidence',
    claims: Array.isArray(report.claims) ? report.claims : [],
    tests: Array.isArray(report.tests) ? report.tests : [],
    uncertainties: Array.isArray(report.uncertainties) ? report.uncertainties : []
  };
}

function positionsFromDossiers(workers, dossiers) {
  const byWorker = new Map((dossiers || []).map((dossier) => [dossier.workerId, dossier]));
  return (workers || [])
    .filter((worker) => workerRecipe(worker))
    .map((worker) => {
      const recipe = workerRecipe(worker);
      const dossier = byWorker.get(worker.agentId) || { workerId: worker.agentId };
      return { ...dossierPosition(dossier), recipeId: recipe.recipeId, recipeKeys: recipe.keys };
    });
}

/**
 * Confrontation : chaque tension déclarée entre deux recettes devient
 * une confrontation ouverte si les deux positions ont exprimé des
 * claims. Une tension sans matière (dossier vide) est écartée — pas de
 * fausse confrontation.
 */
function confrontPositions(positions, crossTensions) {
  return (crossTensions || [])
    .filter((tension) => tension && tension.a && tension.b)
    .map((tension) => {
      const positionA = positions.find((p) => p.recipeId === tension.a.recipe);
      const positionB = positions.find((p) => p.recipeId === tension.b.recipe);
      const expressed = positionA && positionB
        && positionA.claims.length > 0 && positionB.claims.length > 0;
      return {
        keys: { a: tension.a.key, b: tension.b.key },
        recipes: { a: tension.a.recipe, b: tension.b.recipe },
        positions: { a: positionA || null, b: positionB || null },
        expressed,
        status: expressed ? 'open_confrontation' : 'no_matter'
      };
    })
    .filter((confrontation) => confrontation.expressed)
    .slice(0, MAX_TENSIONS);
}

/**
 * Synthèse structurelle : pour chaque position, ses conditions de
 * validité sont ce qu'elle a testé et assumé (tests + uncertainties) ;
 * le niveau commun est l'intersection des recettes ; le résidu
 * irréconciliable est ce que les confrontations ouvertes n'ont pas
 * résolu.
 */
function synthesizePositions(positions, confrontations) {
  const valid = positions.filter((position) => position.outcome === 'success' || position.claims.length > 0);
  const validityConditions = valid.map((position) => ({
    recipeId: position.recipeId,
    testedBy: position.tests,
    assumed: position.uncertainties,
    claimCount: position.claims.length
  }));
  const commonLevel = intersectAll(valid.map((position) => position.recipeKeys || []));
  const irreconcilableResidue = confrontations.map((confrontation) => ({
    keys: confrontation.keys,
    unresolved: true
  }));
  return {
    synthesisLevel: 'structural',
    reconciledPositions: valid.length,
    commonKeys: commonLevel,
    validityConditions,
    irreconcilableResidue
  };
}

function intersectAll(keySets) {
  if (keySets.length === 0) return [];
  return keySets.reduce((acc, keys) => acc.filter((key) => keys.includes(key)));
}

function hasCognitiveMatter(positions) {
  return positions.length >= 2
    && new Set(positions.map((position) => position.recipeId)).size >= 2;
}

/**
 * Applique la confrontation/synthèse cognitive au plan.
 * Retourne null si le plan n'a pas de portfolio (flag OFF au dispatch,
 * workers sans recette) — la barrier est alors inerte, pas en erreur.
 */
async function applyCognitiveSynthesis(ctx) {
  const plan = ctx && ctx.autonomyPlan;
  const portfolio = plan && plan.cognitivePortfolio;
  if (!portfolio || !Array.isArray(portfolio.recipes)) return null;
  const positions = positionsFromDossiers(ctx.workers || [], ctx.usable || ctx.dossiers || []);
  if (!hasCognitiveMatter(positions)) {
    plan.cognitiveSynthesis = { applied: false, reason: 'insufficient_diverse_positions' };
    return plan.cognitiveSynthesis;
  }
  const confrontations = confrontPositions(positions, portfolio.metrics.crossTensions || []);
  const synthesis = synthesizePositions(positions, confrontations);
  plan.cognitiveSynthesis = {
    applied: true,
    openConfrontations: confrontations.length,
    confrontations,
    synthesis
  };
  emit(ctx.agentId, 'COGNITIVE_SYNTHESIS_COMPLETED', 'SYNTHESIZE_COGNITION',
    `Cognitive synthesis: ${confrontations.length} open confrontation(s), ${synthesis.reconciledPositions} position(s) reconciled, ${synthesis.irreconcilableResidue.length} irreconcilable residue item(s).`,
    plan.cognitiveSynthesis, 'info');
  await recordOutcome(ctx, plan, positions);
  return plan.cognitiveSynthesis;
}

/**
 * Persistance du registre de performance : alimente l'évolution NCE
 * (point 9) et la genèse (point 10). Échec doux — la synthèse reste
 * valide même si la persistance échoue.
 */
async function recordOutcome(ctx, plan, positions) {
  if (!ctx.db || !plan.cognitivePortfolio) return;
  try {
    const report = await recipeMemory.recordMissionOutcome(ctx.db, {
      portfolio: plan.cognitivePortfolio,
      synthesis: plan.cognitiveSynthesis,
      context: recipeMemory.contextKey(plan.cognitivePortfolio.needs || [])
    });
    if (report.recorded > 0) {
      emit(ctx.agentId, 'COGNITIVE_PERFORMANCE_RECORDED', 'REMEMBER_COGNITION',
        `Recorded performance for ${report.recorded} recipe(s) in context '${report.context}'.`,
        report, 'info');
    }
  } catch (error) {
    emit(ctx.agentId, 'COGNITIVE_PERFORMANCE_RECORD_FAILED', 'REMEMBER_COGNITION',
      `Failed to record recipe performance: ${error.message}`, { error: error.message }, 'warning');
  }
}

module.exports = {
  applyCognitiveSynthesis,
  positionsFromDossiers,
  confrontPositions,
  synthesizePositions,
  hasCognitiveMatter
};
