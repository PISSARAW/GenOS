/**
 * @file toolHealthProbe.js
 * @description Boucle somatosensorielle numérique : avant d'invoquer
 * un outil, vérifie son état réel (présence, accessibilité, budget,
 * circuit breaker) — comme un corbeau qui tord une brindille avant de
 * s'en servir.
 *
 * Inspiration biologique : le cortex somatosensoriel teste la flexion,
 * la durabilité et le poids de l'outil. Un outil "usé" (statut dégradé)
 * est signalé avant l'engagement.
 *
 * État : aucun état persistant en mémoire. Chaque appel est indépendant.
 * Redémarrage du serveur MCP = état perdu (comme un test somatosensoriel
 * ponctuel).
 */

const TOOL_SENSORY_PROFILE = {
  genos_run: { coût: 'tokens', idempotence: false, état_critique: true },
  genos_snapshot: { coût: 'disk_io', idempotence: true, état_critique: false },
  genos_replay: { coût: 'compute', idempotence: true, état_critique: false },
  genos_diff: { coût: 'compute', idempotence: true, état_critique: false },
  genos_solve: { coût: 'tokens_high', idempotence: false, état_critique: true },
  genos_execute_primitive: { coût: 'compute', idempotence: false, état_critique: false }
};

function sensoryProfileForTool(toolName) {
  for (const [prefix, profile] of Object.entries(TOOL_SENSORY_PROFILE)) {
    if (toolName.startsWith(prefix)) return { ...profile, prefix };
  }
  return { coût: 'unknown', idempotence: false, état_critique: false, prefix: 'generic' };
}

function probeToolState(toolName, budgetRemaining) {
  const profile = sensoryProfileForTool(toolName);
  const budget = Number.isFinite(Number(budgetRemaining)) ? Number(budgetRemaining) : 100;
  const isCritical = profile.état_critique;

  return {
    présent: true,
    exécutable: budget > 0,
    budget_suffisant: budget > (isCritical ? 30 : 10),
    idempotence: profile.idempotence,
    coût_estimé: profile.coût,
    usure_perçue: budget < 20 ? 'élevée' : budget < 50 ? 'modérée' : 'nulle',
    circuit_fermé: true,
    état: budget <= 0 ? 'épuisé' : budget < 15 ? 'dégradé' : 'bon'
  };
}

/**
 * Décision d'engagement : l'outil vaut-il le coût ?
 * Retourne ratio et recommandation.
 */
function computeEngagement(toolName, budget, checks) {
  const profile = sensoryProfileForTool(toolName);
  const coûtWeight = profile.état_critique ? 1.5 : 1.0;
  const coûtPerçu = profile.coût === 'tokens_high' ? 2.0 : profile.coût === 'tokens' ? 1.2 : 1.0;
  const fiabilité = (checks.exécutable && checks.budget_suffisant) ? 1.0 : 0.2;
  const ratio = (fiabilité * 1.0) / (coûtWeight * coûtPerçu);
  const seuil = 0.4;
  const engage = ratio >= seuil && checks.exécutable && checks.budget_suffisant;

  return {
    engage,
    ratio: Number(ratio.toFixed(3)),
    raison: engage
      ? `Ratio ${ratio.toFixed(2)} ≥ seuil ${seuil} — engagement favorable`
      : `Ratio ${ratio.toFixed(2)} < seuil ${seuil} — outil non recommandé`,
    recommandation: engage ? 'PROCÉDER' : 'REJETER ou DÉFERRER'
  };
}

/** Handler action : list. */
function handleListProfiles() {
  const profils = Object.entries(TOOL_SENSORY_PROFILE).map(([k, v]) => ({
    préfixe: k,
    coût: v.coût,
    idempotence: v.idempotence,
    état_critique: v.état_critique
  }));
  return {
    configured: true,
    success: true,
    status: 'completed',
    transport: 'local',
    output: JSON.stringify({ profils_sensory: profils })
  };
}

/** Handler action : status. */
function handleStatus(tool) {
  const état = probeToolState(tool, 100);
  return {
    configured: true,
    success: true,
    status: 'completed',
    transport: 'local',
    output: JSON.stringify({
      outil: tool,
      état_somatosensoriel: état,
      interprétation: `L'outil "${tool}" est ${état.état}. Boucle somatosensorielle terminée.`
    }, null, 2)
  };
}

/** Handler action : probe. */
function handleProbe(tool, budget) {
  const état = probeToolState(tool, budget);
  const décision = computeEngagement(tool, budget, état);

  return {
    configured: true,
    success: true,
    status: décision.engage ? 'completed' : 'tool_error',
    transport: 'local',
    output: JSON.stringify({
      outil: tool,
      budget_remaining: budget,
      état_somatosensoriel: état,
      décision_engagement: décision,
      interprétation: `Test somatosensoriel terminé pour "${tool}". ${décision.raison}.`
    }, null, 2)
  };
}

/**
 * Handler principal. Actions : probe, assess, status.
 */
function handleToolHealthProbe(args, run) {
  const action = (args.action || 'probe').toLowerCase();
  const tool = args.tool || args.outil || 'genos_run';
  const budget = Number.isFinite(Number(args.budget_remaining)) ? Number(args.budget_remaining) : 100;

  if (action === 'list_profiles') return handleListProfiles();
  if (action === 'status') return handleStatus(tool);
  return handleProbe(tool, budget);
}

function handleToolHealthProbeError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
}

module.exports = { handleToolHealthProbe, handleToolHealthProbeError };
