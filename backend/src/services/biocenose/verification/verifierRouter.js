'use strict';

function route(input) {
  const requested = verificationKinds(input.claim);
  const candidates = (input.members || []).filter(isVerifier);
  const verifiers = candidates.map((member) => match(member, requested)).filter((entry) => entry.kinds.length);
  return {
    claimId: input.claim.claimId || null,
    verifiers,
    deterministicAvailable: verifiers.length > 0,
    status: verifiers.length ? 'ROUTED' : 'UNVERIFIED',
    priority: verifiers.length ? 'DETERMINISTIC_VERIFIER_FIRST' : 'NO_DETERMINISTIC_VERIFIER'
  };
}

function verificationKinds(claim) {
  const declared = claim.verification?.kinds || claim.verificationKinds || [];
  if (declared.length) return declared.map(normalize);
  const type = normalize(claim.type || '');
  if (type.includes('math')) return ['formal_proof', 'exact_solver'];
  if (type.includes('code') || type.includes('security')) return ['test', 'replay', 'benchmark'];
  return [];
}

function isVerifier(member) {
  return member.role === 'verifier' && (member.deterministicChecks || member.verificationKinds || member.capabilities);
}

function match(member, requested) {
  const checks = member.deterministicChecks || member.verificationKinds || member.capabilities || [];
  const available = (Array.isArray(checks) ? checks : [checks]).map(normalize);
  const kinds = requested.filter((kind) => available.includes(kind));
  return { memberId: member.memberId || member.id, kinds };
}

function normalize(value) {
  return String(value).toLowerCase().replace(/[ -]+/g, '_');
}

module.exports = { route };
