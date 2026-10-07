'use strict';

const crypto = require('node:crypto');
const verifier = require('../gvxVerifierRegistry');
const verifiedReceipts = new WeakSet();
const CLASSES = new Set(['independent_requirement_verification', 'consciousness_indicator_verification']);

function sameScope(left, right) {
  return ['organizationId', 'projectId', 'entityId'].every((key) =>
    typeof left?.[key] === 'string' && left[key] === right?.[key]);
}

function boundDecision(result, candidate, options) {
  const decision = result.businessDecision;
  return result.verified === true && CLASSES.has(result.evidenceClass)
    && decision?.indicatorId === candidate.indicatorId
    && decision.requirementKind === candidate.requirementKind
    && decision.eligible === true && sameScope(decision.scope, options.scope)
    && /^[a-f0-9]{64}$/.test(options.contextHash || '') && decision.contextHash === options.contextHash;
}

async function verify(candidate, options) {
  const requirement = `consciousness:${candidate.indicatorId}:${candidate.requirementKind}`;
  if (candidate.verifierRequirement && candidate.verifierRequirement !== requirement) return null;
  const result = await verifier.verifyEvidence({ registry: options.verifierRegistry,
    artifactReader: options.artifactReader, evidence: candidate.evidence, requirement });
  if (!boundDecision(result, candidate, options)) return null;
  if (candidate.evidence.artifactHash !== result.artifactHash) return null;
  const receipt = Object.freeze({ indicatorId: candidate.indicatorId, kind: candidate.requirementKind,
    scope: Object.freeze({ ...options.scope }), contextHash: options.contextHash, verifierId: result.verifierId,
    artifactHash: result.artifactHash, evidenceClass: result.evidenceClass,
    receiptHash: crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex') });
  verifiedReceipts.add(receipt);
  return receipt;
}

function isVerified(receipt) { return verifiedReceipts.has(receipt); }

module.exports = { verify, isVerified, sameScope };
