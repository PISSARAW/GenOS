'use strict';

function verifiedClaims(claims) {
  return (Array.isArray(claims) ? claims : []).filter((claim) => (
    isVerifiedClaim(claim)
  ));
}

function isVerifiedClaim(claim) {
  return Boolean(claim && (claim.verified === true || claim.status === 'verified'));
}

function claimTitle(claim) {
  return claim.title || claim.claim || claim.id || null;
}

function claimDescription(claim) {
  return claim.description || claim.text || '';
}

function acceptanceCriterion(claim) {
  return claim.acceptanceCriterion || claim.text || claim.claim;
}

function toWorkPackage(claim) {
  return {
    title: claimTitle(claim),
    description: claimDescription(claim),
    sourceClaimId: claim.id || null,
    acceptanceCriteria: [acceptanceCriterion(claim)].filter(Boolean)
  };
}

function adaptTrinityToATeam(input = {}) {
  const claims = verifiedClaims(input.verifiedClaims);
  const workPackages = claims.map(toWorkPackage);
  return {
    workPackages,
    interfaces: Array.isArray(input.constraints) ? [...input.constraints] : [],
    artifacts: Array.isArray(input.winningArtifacts) ? [...input.winningArtifacts] : [],
    risks: Array.isArray(input.dissent) ? [...input.dissent] : [],
    excludedClaims: (Array.isArray(input.verifiedClaims) ? input.verifiedClaims.length : 0) - claims.length
  };
}

module.exports = { adaptTrinityToATeam };
