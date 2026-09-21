'use strict';

/**
 * Mémoire immunitaire épistémique.
 *
 * Retient les signatures apprises : fausses preuves, types de claim trompeurs,
 * vérificateurs qui ont échoué, contre-exemples décisifs, conditions
 * d'application et affinité mesurée.
 *
 * Invariant testable : une seconde exposition à un pattern connu déclenche
 * une réponse mesurablement plus précise (score de rappel ≥ seuil).
 */

const crypto = require('node:crypto');

const SEUIL_RAPPEL_AUTOMATIQUE = 0.7;
const SEUIL_SIGNATURE_FAIBLE = 0.4;

function signatureFrom(entry) {
  if (typeof entry === 'string') return stableFingerprint(entry);
  const canonical = stableFingerprint(entry.pattern || entry.signature || entry.action || '');
  return canonical;
}

function stableFingerprint(text) {
  const normalized = String(text || '').normalize('NFC').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function makeEntry(pattern, opts = {}) {
  return {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    signature: signatureFrom(pattern),
    pattern: pattern || 'unknown',
    domain: opts.domain || 'general',
    evidence: opts.evidence || null,
    effectiveResponse: opts.effectiveResponse || null,
    affinity: typeof opts.affinity === 'number' ? opts.affinity : 0.5,
    failures: 0,
    successes: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function memoryEntry(pattern, opts = {}) {
  return makeEntry(pattern, opts);
}

function recall(memory, pattern) {
  if (!memory || !Array.isArray(memory)) return null;
  const sig = signatureFrom(pattern);
  const hits = memory.filter((entry) => entry.signature === sig);
  if (!hits.length) return null;
  const best = hits.reduce((a, b) => (a.affinity >= b.affinity ? a : b));
  if (best.affinity < SEUIL_SIGNATURE_FAIBLE) return null;
  return best;
}

function fuzzyRecall(memory, pattern, opts = {}) {
  if (!memory || !Array.isArray(memory)) return [];
  const sig = signatureFrom(pattern);
  const threshold = opts.threshold || SEUIL_RAPPEL_AUTOMATIQUE;
  const candidates = memory.filter((entry) => entry.signature === sig || entry.domain === opts.domain);
  return candidates.filter((e) => e.affinity >= threshold);
}

function updateEntryAffinity(entry, success) {
  entry.failures += success ? 0 : 1;
  entry.successes += success ? 1 : 0;
  const total = entry.successes + entry.failures;
  entry.affinity = total > 0 ? entry.successes / total : entry.affinity;
  entry.affinity = Math.min(1, Math.max(0, entry.affinity));
}

function recordOutcome(memory, pattern, opts = {}) {
  const sig = signatureFrom(pattern);
  let entry = memory.find((e) => e.signature === sig);
  if (!entry) {
    entry = makeEntry(pattern, { domain: opts.domain, evidence: opts.evidence, effectiveResponse: opts.effectiveResponse, affinity: 0.4 });
    memory.push(entry);
  }
  entry.updatedAt = new Date().toISOString();
  updateEntryAffinity(entry, opts.success);
  entry.effectiveResponse = opts.effectiveResponse || entry.effectiveResponse;
  return entry;
}

function priorityRank(memory, pattern) {
  const sig = signatureFrom(pattern);
  const candidate = memory.find((e) => e.signature === sig);
  if (!candidate) return null;
  return {
    signature: candidate.signature,
    domain: candidate.domain,
    affinity: candidate.affinity,
    effectiveResponse: candidate.effectiveResponse,
    strength: candidate.successes - candidate.failures,
  };
}

module.exports = {
  signatureFrom,
  memoryEntry,
  recall,
  fuzzyRecall,
  recordOutcome,
  priorityRank,
  SEUIL_RAPPEL_AUTOMATIQUE,
  SEUIL_SIGNATURE_FAIBLE,
};
