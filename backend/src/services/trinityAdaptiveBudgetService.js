'use strict';

const { extractEvidenceReport } = require('./agentEvidenceService');
const evidenceAudit = require('./trinityEvidenceAudit');

function validUncertainty(report) {
  const value = Number(report?.evidenceVector?.uncertainty);
  const references = report?.evidenceVectorEvidence?.uncertainty;
  const evidence = Array.isArray(report?.evidence) ? report.evidence : [];
  const known = new Set(evidence.filter((item) => item && typeof item === 'object'
    && evidenceAudit.isVerifiedReceipt(item.verificationReceipt || item.receipt))
    .map((item) => item.id).filter(Boolean).map(String));
  if (!Number.isFinite(value) || value < 0 || value > 1 || !Array.isArray(references) || !references.length) return null;
  return references.every((reference) => known.has(String(reference))) ? value : null;
}

function resultForWorld(input, index) {
  const agentId = input.workerIds[index];
  const result = input.results.find((item) => item.agentId === agentId);
  if (!result || result.status !== 'completed') return null;
  const report = extractEvidenceReport(result.payload) || {};
  const uncertainty = validUncertainty(report);
  return uncertainty === null ? null : { worldNumber: index + 1, agentId, uncertainty, evidenceRefs: report.evidenceVectorEvidence.uncertainty };
}

function distribute(input) {
  const count = input.worlds.length;
  const minimumPool = input.minimumTokens * count;
  const available = input.pool - minimumPool;
  const totalWeight = input.worlds.reduce((sum, world) => sum + 0.1 + world.uncertainty, 0);
  const allocations = input.worlds.map((world) => Math.floor(available * (0.1 + world.uncertainty) / totalWeight));
  const remainder = available - allocations.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < remainder; index += 1) allocations[index % count] += 1;
  return input.worlds.map((world, index) => ({ ...world, tokens: input.minimumTokens + allocations[index] }));
}

function allocate(input) {
  const worlds = input.workerIds.map((_, index) => resultForWorld(input, index));
  if (worlds.length !== 3 || worlds.some((world) => !world) || input.pool < input.minimumTokens * 3) return null;
  return { basis: 'verified_evidence_vector_uncertainty', worlds: distribute({ ...input, worlds }) };
}

function configurationReady(config = {}) {
  const pool = Number(config.poolTokens), minimum = Number(config.minimumTokens);
  return Number.isSafeInteger(pool) && pool > 0 && Number.isSafeInteger(minimum) && minimum > 0 && pool >= minimum * 3;
}

module.exports = { allocate, configurationReady };
