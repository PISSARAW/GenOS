'use strict';

const ATTACKS = new Set(['ATTACK', 'REFUTE', 'UNDERCUT', 'COUNTEREXAMPLE']);

function evaluate(input) {
  const claims = input.claims || [];
  const argumentsList = input.arguments || [];
  const byClaim = new Map(claims.map((claim) => [claim.claimId, []]));
  for (const item of argumentsList) {
    const targetClaimId = attackTarget(item);
    if (byClaim.has(targetClaimId)) byClaim.get(targetClaimId).push(item);
  }
  const verified = new Set(input.verifiedClaimIds || []);
  return claims.map((claim) => labelClaim(claim, byClaim.get(claim.claimId) || [], verified));
}

function attackTarget(item) {
  if (!ATTACKS.has(item.relation)) return item.claimId;
  return item.argument?.targetClaimId || item.targetClaimId || item.claimId;
}

function labelClaim(claim, argumentsList, verified) {
  const support = argumentsList.filter((item) => item.relation === 'SUPPORT');
  const attacks = argumentsList.filter((item) => ATTACKS.has(item.relation));
  const supported = support.length > 0 || verified.has(claim.claimId);
  const attacked = attacks.length > 0;
  const status = supported && !attacked ? 'ACCEPTED'
    : attacked && !supported ? 'REJECTED' : 'UNDECIDED';
  return {
    claimId: claim.claimId, status, burdenOfProof: supported ? 'MET' : 'UNMET',
    supportingArgumentIds: support.map((item) => item.argumentId),
    attackingArgumentIds: attacks.map((item) => item.argumentId),
    contradiction: supported && attacked,
    provenance: [...support, ...attacks].map((item) => ({
      argumentId: item.argumentId, memberId: item.createdBy, relation: item.relation
    }))
  };
}

module.exports = { evaluate };
