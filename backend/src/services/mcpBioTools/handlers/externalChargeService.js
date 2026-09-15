/**
 * @file externalChargeService.js
 * @description Détection et utilisation de batteries environnementales.
 * Quand l'agent est à basse charge, il scanne l'environnement pour
 * trouver des sources de recharge externes (tokens gratuits, escalade
 * vers un modèle plus puissant, pause stratégique, réduction de coût).
 *
 * Inspiration biologique : les lézards ectothermes utilisent le soleil
 * comme chargeur externe. Leurs thermorécepteurs et glande pinéale
 * scannent l'environnement ; à capacité max, un signal d'inconfort les
 * renvoient à l'ombre.
 */

const chargeSources = new Map();

/**
 * Enregistre une source de recharge externe détectée.
 * Copie superficielle : l'objet profile peut être réutilisé/modifié
 * par l'appelant après l'enregistrement. On ne stocke pas la référence.
 */
function registerChargeSource(sourceId, profile) {
  chargeSources.set(sourceId, {
    sourceId,
    type: profile.type || 'inconnu',
    coût_actuel: profile.coût_actuel ?? null,
    disponibilité: profile.disponibilité ?? 'inconnue',
    lastSeen: new Date().toISOString(),
    métadonnées: profile.métadonnées ? { ...profile.métadonnées } : {}
  });
}

/**
 * Scanne les sources de recharge connues et retourne celles
 * accessibles.
 */
function scanChargeSources(budget, seuilMax) {
  const seuil = Number.isFinite(Number(seuilMax)) ? Number(seuilMax) : 30;
  const besoins = Number.isFinite(Number(budget)) ? Number(budget) : 100;
  const disponibles = [];

  for (const [, source] of chargeSources) {
    const coût = source.coût_actuel;
    if (coût !== null && (besoins <= seuil || coût <= seuil)) {
      disponibles.push({
        sourceId: source.sourceId,
        type: source.type,
        coût_actuel: coût,
        disponibilité: source.disponibilité,
        lastSeen: source.lastSeen,
        utilisable: true
      });
    }
  }

  disponibles.sort((a, b) => (a.coût_actuel || 0) - (b.coût_actuel || 0));
  return disponibles;
}

/**
 * Détecte l'état thermique de l'agent.
 */
function thermalRegulationAdvice(currentBudget, baseline) {
  const baselineVal = Number.isFinite(Number(baseline)) ? Number(baseline) : 100;
  const current = Number.isFinite(Number(currentBudget)) ? Number(currentBudget) : 0;
  const ratio = baselineVal > 0 ? current / baselineVal : 0;

  if (ratio >= 0.7) return { statut: 'chaud', action: 'normal', description: 'Capacité suffisante — opérer normalement.' };
  if (ratio >= 0.4) return { statut: 'tiède', action: 'prudent', description: 'Capacité modérée — privilégier les outils low-cost.' };
  if (ratio >= 0.15) return { statut: 'froid', action: 'recharger', description: 'Capacité faible — chercher source de recharge externe.' };
  return { statut: 'édiem', action: 'hiberner', description: 'Capacité critique — réduire activité ou hiberner (cryptobiosis).' };
}

/** Crée la réponse standardisée d'un handler. */
function makeResponse(output) {
  return { configured: true, success: true, status: 'completed', transport: 'local', output };
}

/** Handler action : register. */
function handleRegisterAction(args) {
  const sourceId = args.source_id || args.id || `source_${Date.now()}`;
  const profile = {
    type: args.type || 'inconnu',
    coût_actuel: args.coût_actuel != null ? Number(args.coût_actuel) : null,
    disponibilité: args.disponibilité || 'inconnue',
    métadonnées: args.métadonnées || {}
  };
  registerChargeSource(sourceId, profile);

  return makeResponse(JSON.stringify({
    sourceId,
    enregistré: true,
    profil: profile,
    interprétation: `Source de recharge "${sourceId}" enregistrée.`
  }, null, 2));
}

/** Handler action : advice (alias thermal). */
function handleAdviceAction(agentId, budget, baseline) {
  const conseil = thermalRegulationAdvice(budget, baseline);

  return makeResponse(JSON.stringify({
    agentId,
    budget_actuel: budget,
    budget_baseline: baseline,
    thermorégulation: conseil,
    interprétation: `Signaux thermiques pour "${agentId}" : ${conseil.description}`
  }, null, 2));
}

/** Handler action : status. */
function handleStatusAction(opts) {
  const état = thermalRegulationAdvice(opts.budget, opts.baseline);
  const sources = scanChargeSources(opts.budget, opts.seuilMax);

  return makeResponse(JSON.stringify({
    agentId: opts.agentId,
    thermorégulation: état,
    sources_recharge_détectées: sources.length,
    sources: sources.slice(0, 5),
    interprétation: `État de charge pour "${opts.agentId}" : ${état.description}`
  }, null, 2));
}

/** Handler action : scan. */
function handleScanAction(budget, seuilMax) {
  const sources = scanChargeSources(budget, seuilMax);

  return makeResponse(JSON.stringify({
    sources_recharge: sources,
    count: sources.length,
    interprétation: `Scan environnemental terminé : ${sources.length} source(s) de recharge détectée(s).`
  }, null, 2));
}

/**
 * Handler principal.
 */
function handleExternalChargeService(args, run) {
  const action = (args.action || 'scan').toLowerCase();
  const agentId = args.agent_id || args.id || 'agent-défaut';
  const budget = Number.isFinite(Number(args.budget)) ? Number(args.budget) : 50;
  const baseline = Number.isFinite(Number(args.baseline)) ? Number(args.baseline) : 100;

  if (action === 'register') return handleRegisterAction(args);
  if (action === 'advice' || action === 'thermal') return handleAdviceAction(agentId, budget, baseline);
  if (action === 'status') return handleStatusAction({ agentId, budget, baseline, seuilMax: args.seuil_max });
  return handleScanAction(budget, args.seuil_max);
}

function handleExternalChargeServiceError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
}

module.exports = { handleExternalChargeService, handleExternalChargeServiceError };
