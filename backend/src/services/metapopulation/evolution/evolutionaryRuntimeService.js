'use strict';
const { randomUUID } = require('crypto');
const { createHash } = require('crypto');

const genomeRegistry = new Map();
const speciationThreshold = 0.7;

function registerGenomeLineage(demeId, genomeHash, metadata) {
  const id = `genome-${demeId}-${Date.now()}`;
  const entry = { genomeId: id, demeId, genomeHash, metadata: metadata || {}, createdAt: new Date().toISOString(), certified: false };
  genomeRegistry.set(id, entry);
  return entry;
}

function getGenomeCertificate(genomeId) {
  const genome = genomeRegistry.get(genomeId);
  if (!genome) return null;
  return {
    genomeId: genome.genomeId,
    demeId: genome.demeId,
    genomeHash: genome.genomeHash,
    certified: genome.certified,
    certificateId: `cert-${genomeId}-${Date.now()}`,
    issuedAt: new Date().toISOString(),
  };
}

function certifyGenome(genomeId, fitnessEvidence) {
  const genome = genomeRegistry.get(genomeId);
  if (!genome) return null;
  genome.certified = true;
  genome.fitnessEvidence = fitnessEvidence;
  return getGenomeCertificate(genomeId);
}

function evaluateLocalFitness(individual, context) {
  const contextStr = JSON.stringify(context || {});
  const hash = createHash('sha256').update(`${individual.ref || ''}:${contextStr}`).digest('hex').slice(0, 16);
  const raw = parseInt(hash.slice(0, 8), 16) / 0xFFFFFFFF;
  return { fitness: Math.max(0, Math.min(1, raw)), evidenceRef: hash };
}

function compareFitness(before, after) {
  return { delta: after - before, improved: after > before, direction: after > before ? 'up' : 'down' };
}

function detectSpeciation(context) {
  const { migrationHistoryAB, migrationHistoryBA } = context;
  const compat = acceptanceRate(migrationHistoryAB, migrationHistoryBA);
  const divergence = 1 - compat * 0.5;
  return {
    divergence: Math.round(divergence * 100) / 100,
    speciated: divergence > speciationThreshold,
    threshold: speciationThreshold,
    reason: divergence > speciationThreshold ? 'DIVERGENCE_ABOVE_THRESHOLD' : 'NOT_SPECIATED',
  };
}

function acceptanceRate(historyAB, historyBA) {
  const total = historyAB.length + historyBA.length;
  if (!total) return 0.5;
  return (acceptanceCount(historyAB) + acceptanceCount(historyBA)) / 2;
}

function acceptanceCount(history) {
  if (!history.length) return 0;
  return history.filter((m) => m.accepted).length / history.length;
}

function crossIslandMigrantCertificate(context) {
  const { migrant, sourceDemeId, targetDemeId, seed } = context;
  return {
    certificateId: `migcert-${randomUUID()}`,
    migrantId: migrant.propaguleId || migrant.id,
    sourceDemeId,
    targetDemeId,
    seed: seed || migrantSeed(sourceDemeId, targetDemeId),
    generatedAt: new Date().toISOString(),
    reproducible: true,
  };
}

function migrantSeed(sourceDemeId, targetDemeId) {
  return createHash('sha256').update(`${sourceDemeId}:${targetDemeId}:${Date.now()}`).digest('hex').slice(0, 16);
}

function reproducibleSeedAttestor(context) {
  const { missionId, demeId, generation, solverId } = context;
  const seed = createHash('sha256')
    .update(`${missionId || ''}:${demeId}:${generation || 0}:${solverId || 'evolution'}`)
    .digest('hex').slice(0, 16);
  return { seed, attestor: 'deterministic-seed-factory', missionId, demeId, generation, solverId };
}

function createQualityDiversityArchive(dimensions) {
  const cells = new Map();
  return { dimensions: dimensions || ['novelty', 'fitness'], cells, insertions: 0, displacements: 0 };
}

function qdNicheKey(archive, descriptor) {
  return archive.dimensions.map((dim) => quantizeDescriptor(descriptor?.[dim])).join(':');
}

function quantizeDescriptor(value) {
  if (!Number.isFinite(value)) return 'x';
  return String(Math.max(0, Math.min(9, Math.floor(value * 10))));
}

function qdInsert(archive, individual) {
  const key = qdNicheKey(archive, individual.descriptor);
  const fitness = Number(individual.fitness);
  const elite = archive.cells.get(key);
  archive.insertions += 1;
  if (elite && Number(elite.fitness) >= fitness) return { inserted: false, displaced: false, key, coverage: qdCoverage(archive) };
  archive.cells.set(key, { individualId: individual.id || individual.ref || key, fitness, descriptor: individual.descriptor || {} });
  if (elite) archive.displacements += 1;
  return { inserted: true, displaced: Boolean(elite), key, coverage: qdCoverage(archive) };
}

function qdCoverage(archive) {
  const filled = archive.cells.size;
  const total = Math.pow(10, archive.dimensions.length);
  return { filled, total, ratio: total > 0 ? filled / total : 0, insertions: archive.insertions, displacements: archive.displacements };
}

module.exports = { registerGenomeLineage, getGenomeCertificate, certifyGenome, evaluateLocalFitness, compareFitness, detectSpeciation, crossIslandMigrantCertificate, reproducibleSeedAttestor, createQualityDiversityArchive, qdInsert, qdCoverage };
