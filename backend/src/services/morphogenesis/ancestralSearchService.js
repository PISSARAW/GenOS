'use strict';

/**
 * AncestralSearchService — fossil memory as prior, never as truth.
 *
 * Before costly decisions (mutation, speciation, radical topology
 * transition, repeated dead-end, unknown failure), the Morphogenesis
 * Runtime queries extinct lineages: similar morphology? same failure?
 * which capabilities/topologies/plasmids/phenotypes led to death?
 *
 * Invariants (non-négociables 13-15) :
 * - fossil = terminal, immutable, non ressuscitable ;
 * - fossil → inspiration → candidate genome, jamais vivant ;
 * - failed fossils raise expected regret, never act as universal law.
 */

const { listFossils, verifyFossilIntegrity } = require('../fossilizationService');

const MAX_RESULTS = 5;
const SIMILARITY_THRESHOLD = 0.35;

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function normToken(value) {
  return String(value || '').toLowerCase().trim();
}

function tokenSetOf(values) {
  return new Set(asList(values).map(normToken).filter(Boolean));
}

function jaccard(left, right) {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  let inter = 0;
  for (const token of left) {
    if (right.has(token)) inter += 1;
  }
  return inter / union.size;
}

function payloadOf(fossil) {
  const mineral = fossil.mineral_payload || fossil.mineralPayload || {};
  return mineral && typeof mineral === 'object' ? mineral : {};
}

function morphologyOf(fossil) {
  const payload = payloadOf(fossil);
  return {
    capabilities: asList(payload.capabilities || fossil.hard_parts),
    topology: payload.topology || payload.topologyTrajectory || null,
    strategy: payload.strategy || payload.strategyTrajectory || null,
    errorSignature: payload.errorSignature || payload.failureReason || fossil.reason
  };
}

function scoreFossil(query, fossil) {
  const current = {
    caps: tokenSetOf(query.capabilities),
    topo: normToken(query.topology),
    error: normToken(query.errorSignature)
  };
  const past = morphologyOf(fossil);
  const pastCaps = tokenSetOf(past.capabilities);
  const capScore = jaccard(current.caps, pastCaps);
  const topoScore = current.topo && normToken(past.topology).includes(current.topo) ? 1 : 0;
  const errorScore = current.error && normToken(past.errorSignature).includes(current.error) ? 1 : 0;
  const score = capScore * 0.5 + topoScore * 0.25 + errorScore * 0.25;
  return { score, past };
}

function isFailurePrior(fossil) {
  const reason = normToken(fossil.reason);
  return /fail|dead|extinct|stall|regress|abort|timeout/i.test(reason);
}

function toEvidence(fossil, scored) {
  return {
    fossilId: fossil.fossil_id,
    lineageId: fossil.extinct_lineage_id,
    similarity: Math.round(scored.score * 100) / 100,
    failurePrior: isFailurePrior(fossil),
    morphology: scored.past,
    integrityVerified: verifyFossilIntegrity(fossil),
    recordedAt: fossil.recorded_at,
    priorKind: isFailurePrior(fossil) ? 'negative' : 'positive',
    resurrection: 'forbidden'
  };
}

function rankEvidences(scoredList) {
  return scoredList
    .filter((entry) => entry.scored.score >= SIMILARITY_THRESHOLD)
    .sort((left, right) => right.scored.score - left.scored.score)
    .slice(0, MAX_RESULTS)
    .map((entry) => toEvidence(entry.fossil, entry.scored));
}

function regretDeltaOf(evidences) {
  const negatives = evidences.filter((item) => item.priorKind === 'negative').length;
  if (negatives === 0) return 0;
  return Math.min(0.6, 0.2 * negatives);
}

async function searchAncestors(query, db) {
  const fossils = await listFossils(db, { limit: 200 });
  const scoredList = fossils.map((fossil) => ({ fossil, scored: scoreFossil(query, fossil) }));
  const evidences = rankEvidences(scoredList);
  return {
    query: { capabilities: query.capabilities, topology: query.topology },
    evidences,
    expectedRegretDelta: regretDeltaOf(evidences),
    searchedAt: new Date().toISOString()
  };
}

module.exports = {
  searchAncestors,
  MAX_RESULTS,
  SIMILARITY_THRESHOLD
};
