'use strict';

/**
 * @file affordanceMemoryService.js
 * @description Service de mémoire des affordances.
 *
 * Les affordances sont des "ce qui peut être fait avec X dans le contexte Y".
 * Elles sont découvertes par l'exploration (PlaySandbox) ou par observation
 * de l'environnement. Cette mémoire permet de réutiliser les découvertes
 * futures et d'orienter la curiosité.
 *
 * Structure :
 *  - capability : ce qui peut être fait (ex: "browser_peut_scraper")
 *  - context : dans quel contexte (ex: "page_web_dynamique")
 *  - confidence : degré de fiabilité [0,1]
 *  - provenance : source de la découverte
 *  - utility : utilité mesurée lors de l'utilisation
 *  - last_seen : dernière observation
 *  - use_count : nombre d'utilisations réussies
 */

const crypto = require('crypto');

// ─── Stockage en mémoire (transitoire, persistable en BDD) ──────────

const affordanceStore = new Map();

function makeAffordanceKey(capability, context) {
  return `${capability}||${context}`;
}

function createAffordance(capability, context, options) {
  options = options || {};
  const key = makeAffordanceKey(capability, context);
  const id = `aff_${crypto.randomBytes(4).toString('hex')}_${Date.now()}`;

  return {
    id,
    capability,
    context,
    confidence: options.confidence != null ? options.confidence : 0.5,
    provenance: options.provenance || 'observation',
    utility: options.utility || 0.5,
    metadata: options.metadata || {},
    use_count: 0,
    success_count: 0,
    failure_count: 0,
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    active: true,
  };
}

// ─── CRUD ───────────────────────────────────────────────────────────

function storeAffordance(capability, context, options) {
  options = options || {};
  const key = makeAffordanceKey(capability, context);
  const existing = affordanceStore.get(key);

  if (existing) {
    // Mise à jour de l'existant
    existing.confidence = mergeConfidence(existing.confidence, options.confidence || existing.confidence);
    existing.last_seen = new Date().toISOString();
    if (options.utility != null) existing.utility = options.utility;
    if (options.provenance) existing.provenance = options.provenance;
    if (options.metadata) existing.metadata = Object.assign({}, existing.metadata, options.metadata);
    return existing;
  }

  const affordance = createAffordance(capability, context, options);
  affordanceStore.set(key, affordance);
  return affordance;
}

function getAffordance(capability, context) {
  const key = makeAffordanceKey(capability, context);
  return affordanceStore.get(key) || null;
}

function getOrCreateAffordance(capability, context, options) {
  return getAffordance(capability, context) || storeAffordance(capability, context, options);
}

function listAffordances(filter) {
  filter = filter || {};
  const results = [];
  for (const aff of affordanceStore.values()) {
    if (!aff.active) continue;
    if (!affordanceMatchesFilter(aff, filter)) continue;
    results.push(aff);
  }
  return results;
}

function affordanceMatchesFilter(aff, filter) {
  if (filter.capability && aff.capability !== filter.capability) return false;
  if (filter.context && aff.context !== filter.context) return false;
  if (filter.minConfidence != null && aff.confidence < filter.minConfidence) return false;
  if (filter.provenance && aff.provenance !== filter.provenance) return false;
  return true;
}

function deactivateAffordance(capability, context) {
  const aff = getAffordance(capability, context);
  if (aff) aff.active = false;
  return aff;
}

// ─── Mise à jour par l'expérience ────────────────────────────────────

function recordSuccess(capability, context) {
  const aff = getOrCreateAffordance(capability, context);
  aff.use_count += 1;
  aff.success_count += 1;
  aff.last_seen = new Date().toISOString();
  aff.confidence = Math.min(1, aff.confidence + 0.1);
  aff.utility = (aff.utility * (aff.use_count - 1) + 1) / aff.use_count;
  return aff;
}

function recordFailure(capability, context) {
  const aff = getOrCreateAffordance(capability, context);
  aff.use_count += 1;
  aff.failure_count += 1;
  aff.last_seen = new Date().toISOString();
  aff.confidence = Math.max(0, aff.confidence - 0.05);
  aff.utility = (aff.utility * (aff.use_count - 1) + 0) / aff.use_count;
  return aff;
}

// ─── Fusion de confiance ────────────────────────────────────────────

function mergeConfidence(current, incoming) {
  // Moyenne pondérée qui favorise les observations récentes
  if (incoming == null) return current;
  const alpha = 0.3;
  return alpha * incoming + (1 - alpha) * current;
}

// ─── Requêtes utiles pour la curiosité ──────────────────────────────

function findUnknownContexts(capability, allContexts) {
  // Retourne les contextes non encore testés pour une capacité donnée
  const known = new Set();
  for (const ctx of allContexts) {
    const aff = getAffordance(capability, ctx);
    if (aff && aff.confidence > 0.3) known.add(ctx);
  }
  return allContexts.filter((ctx) => !known.has(ctx));
}

function findMostPromising(minConfidence) {
  const min = minConfidence || 0.5;
  const candidates = listAffordances({ minConfidence: min });
  candidates.sort((a, b) => (b.confidence * b.utility) - (a.confidence * a.utility));
  return candidates.slice(0, 10);
}

function getStats() {
  let total = 0, active = 0, highConfidence = 0, totalUses = 0;
  for (const aff of affordanceStore.values()) {
    total += 1;
    if (aff.active) active += 1;
    if (aff.confidence >= 0.7) highConfidence += 1;
    totalUses += aff.use_count;
  }
  return { total, active, highConfidence, totalUses };
}

module.exports = {
  storeAffordance,
  getAffordance,
  getOrCreateAffordance,
  listAffordances,
  deactivateAffordance,
  recordSuccess,
  recordFailure,
  mergeConfidence,
  findUnknownContexts,
  findMostPromising,
  getStats,
  createAffordance,
  affordanceStore,
};
