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
// Borne LRU : la mémoire immunitaire ne croît pas sans limite (éviction
// plus faible affinité / plus ancienne au-delà).
const MAX_MEMORY_ENTRIES = 1000;

function signatureFrom(entry) {
  if (typeof entry === 'string') return stableFingerprint(entry);
  if (entry && entry.claim) return antigenSignature(entry);
  const canonical = stableFingerprint(entry.pattern || entry.signature || entry.action || '');
  return canonical;
}

function antigenSignature(antigen) {
  const evidenceKind = antigen.epitopes?.evidence?.kind || 'no-evidence';
  const domain = antigen.epitopes?.validityDomain?.domain || antigen.domain || 'general';
  const assumptions = [...(antigen.epitopes?.assumptions || [])].sort();
  const producer = antigen.producer?.model || antigen.producer?.name || 'unknown';
  const canonical = { assumptions, claim: antigen.claim, domain, evidenceKind, producer };
  const sortedKeys = Object.keys(canonical).sort();
  const ordered = sortedKeys.reduce((obj, k) => { obj[k] = canonical[k]; return obj; }, {});
  return stableFingerprint(JSON.stringify(ordered));
}

function stableFingerprint(text) {
  const normalized = String(text || '').normalize('NFC').trim();
  // 128 bits (32 hex) : 64 bits exposaient aux collisions de second
  // préimage sur des corpus adverses de patterns.
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32);
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
    pending: false,
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

function tokensOf(text) {
  return new Set(String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

function jaccardSimilarity(left, right) {
  const a = tokensOf(left);
  const b = tokensOf(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

function claimTextFromObject(pattern) {
  if (typeof pattern.claim === 'string') return pattern.claim;
  if (pattern.claim && pattern.claim.text) return pattern.claim.text;
  return null;
}

function claimTextOf(pattern) {
  if (!pattern || typeof pattern !== 'object') return String(pattern || '');
  const direct = claimTextFromObject(pattern);
  if (direct) return direct;
  if (pattern.pattern && typeof pattern.pattern === 'object') return claimTextOf(pattern.pattern);
  return String(pattern.pattern || pattern.signature || '');
}

function similarEntries(memory, pattern, threshold) {
  const reference = claimTextOf(pattern);
  if (!reference) return [];
  return memory.filter((entry) => {
    if (entry.affinity < SEUIL_SIGNATURE_FAIBLE) return false;
    return jaccardSimilarity(reference, claimTextOf(entry)) >= threshold;
  });
}

function thresholdRecall(memory, pattern, opts = {}) {
  if (!memory || !Array.isArray(memory)) return [];
  const sig = signatureFrom(pattern);
  const threshold = opts.threshold || SEUIL_RAPPEL_AUTOMATIQUE;
  const candidates = memory.filter((entry) => entry.signature === sig);
  return candidates.filter((e) => e.affinity >= threshold);
}

function mergeRecallResults(exact, similar, threshold) {
  const seen = new Set(exact.map((e) => e.id));
  const merged = exact.slice();
  for (const entry of similar) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    merged.push(entry);
  }
  return merged.filter((e) => e.affinity >= threshold);
}

function fuzzyRecall(memory, pattern, opts = {}) {
  const exact = thresholdRecall(memory, pattern, opts);
  const similar = similarEntries(memory, pattern, opts.similarity || 0.4);
  return mergeRecallResults(exact, similar, opts.threshold || SEUIL_RAPPEL_AUTOMATIQUE);
}

function updateEntryAffinity(entry, success) {
  entry.failures += success ? 0 : 1;
  entry.successes += success ? 1 : 0;
  const total = entry.successes + entry.failures;
  entry.affinity = total > 0 ? entry.successes / total : entry.affinity;
  entry.affinity = Math.min(1, Math.max(0, entry.affinity));
}

function evictIfFull(memory) {
  while (memory.length >= MAX_MEMORY_ENTRIES) {
    let victim = 0;
    for (let i = 1; i < memory.length; i++) {
      if (memory[i].affinity < memory[victim].affinity) victim = i;
    }
    memory.splice(victim, 1);
  }
}

function recordOutcome(memory, pattern, opts = {}) {
  const sig = signatureFrom(pattern);
  let entry = memory.find((e) => e.signature === sig);
  if (!entry) {
    evictIfFull(memory);
    entry = makeEntry(pattern, {
      domain: opts.domain,
      evidence: opts.evidence,
      effectiveResponse: opts.effectiveResponse,
      affinity: 0.4,
      pending: true,
    });
    memory.push(entry);
  }
  entry.updatedAt = new Date().toISOString();

  // Règle critique : host.accepted ≠ success.
  // Tant que la vérité n'est pas résolue par un oracle externe,
  // l'outcome reste 'pending' et n'affecte pas l'affinité.
  if (opts.outcome === 'pending') {
    entry.pending = true;
    return entry;
  }

  // Seul un oracle externe peut marquer un résultat comme success/failure.
  if (opts.outcome === 'success' || opts.outcome === 'failure') {
    entry.pending = false;
    updateEntryAffinity(entry, opts.outcome === 'success');
  }

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
  thresholdRecall,
  recordOutcome,
  priorityRank,
  jaccardSimilarity,
  evictIfFull,
  MAX_MEMORY_ENTRIES,
  SEUIL_RAPPEL_AUTOMATIQUE,
  SEUIL_SIGNATURE_FAIBLE,
};
