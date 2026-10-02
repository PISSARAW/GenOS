'use strict';

const ledger = require('../gvxDevelopmentLedger');
const gate = require('./indicatorPromotionGate');

async function collect(options) {
  validate(options);
  const events = await ledger.listEvents(options.db, { ...options.scope, limit: 2000 });
  const candidates = events.filter((event) => event.payload?.kind === 'consciousness_indicator_evidence'
    && event.payload.indicatorId === options.indicatorId).map((event) => event.payload);
  const receipts = await verifyCandidates(candidates, options);
  const accepted = gate.validReceipts(receipts);
  return { indicatorId: options.indicatorId, receipts: accepted,
    rejectedCount: candidates.length - accepted.length, highestStage: gate.highestStage(accepted) };
}

async function verifyCandidates(candidates, options) {
  if (!options.verifierRegistry || typeof options.artifactReader !== 'function') return [];
  const verifier = require('../gvxVerifierRegistry');
  const receipts = [];
  for (const candidate of candidates) {
    const result = await verifier.verifyEvidence({ registry: options.verifierRegistry,
      artifactReader: options.artifactReader, evidence: candidate.evidence,
      requirement: candidate.verifierRequirement || candidate.kind });
    if (!result.verified || result.evidenceClass === 'artifact_integrity_only') continue;
    receipts.push({ ...candidate, kind: candidate.requirementKind, verified: true, independentVerification: true,
      verifierId: result.verifierId, artifactHash: result.artifactHash,
      receiptHash: require('node:crypto').createHash('sha256').update(JSON.stringify(result)).digest('hex'),
      evidenceClass: result.evidenceClass });
  }
  return receipts;
}

function validate(options) {
  if (!options?.db || !options.indicatorId || !options.scope?.organizationId
    || !options.scope?.projectId || !options.scope?.entityId) throw new TypeError('Indicator evidence scope is required.');
}

module.exports = { collect, validate, verifyCandidates };
