'use strict';

/**
 * Policy Masking (le control plane contraint, le LLM évolue dedans).
 *
 * Le rollout ne parle plus au LLM : ses prédictions ferment des portes.
 * maskLease() retire du lease les outils dont le taux de succès observé
 * (world-model, clé partagée 'routing') est < seuil avec un minimum
 * d'observations ; fail-soft (jamais moins d'un outil, jamais sans
 * historique) ; appelant : missionLease après la contrainte de focus.
 */

const MIN_OBSERVATIONS = 5;
const DEFAULT_SUCCESS_FLOOR = 0.3;

async function reliabilityOf(db, tool) {
  try {
    const worldModel = require('./worldModelService');
    const predicted = await worldModel.predictState(db, 'routing', { action: tool });
    if (!predicted || predicted.n < MIN_OBSERVATIONS) return null;
    return predicted.successRate;
  } catch (_) {
    return null;
  }
}

async function maskLease(db, lease, options) {
  const settings = options || {};
  const floor = Number.isFinite(Number(settings.successFloor)) ? Number(settings.successFloor) : DEFAULT_SUCCESS_FLOOR;
  const tools = Array.isArray(lease) ? lease.filter((tool) => typeof tool === 'string') : [];
  if (!db || tools.length <= 1) return { lease: tools, masked: [], reason: tools.length <= 1 ? 'single_tool' : 'missing_db' };
  const kept = [];
  const masked = [];
  for (const tool of tools) {
    const reliability = await reliabilityOf(db, tool);
    if (reliability !== null && reliability < floor) masked.push({ tool, reliability });
    else kept.push(tool);
  }
  if (!kept.length && masked.length) {
    const fallback = masked.sort((a, b) => b.reliability - a.reliability)[0];
    return { lease: [fallback.tool], masked: masked.filter((entry) => entry.tool !== fallback.tool), reason: 'fail_soft_best_remaining' };
  }
  return { lease: kept, masked, reason: masked.length ? 'low_predicted_reliability' : 'all_reliable' };
}

module.exports = { maskLease, MIN_OBSERVATIONS, DEFAULT_SUCCESS_FLOOR };
