'use strict';

const service = require('../../src/services/biocenoseService');

async function prepare(db, options = {}) {
  return service.prepareCommunity({ db, orchestratorId: 'completion-test', mission: 'Assess the supplied proposition.',
    options: { variant: 'epistemic_jury', questionType: 'FACTUAL', ...options,
      population: { generators: 1, reviewers: 1, verifiers: 1 }, memberCandidates: candidates() } });
}

function candidates() {
  return ['generator', 'reviewer', 'verifier'].map((role, index) => ({ memberId: role, communityRole: role,
    provider: `provider-${index}`, expertise: ['general'], verificationKinds: ['formal_proof'] }));
}

function invoke(request) {
  if (request.phase === 'SEALED_JUDGMENT') return { judgment: { position: 'initial', confidence: 0.6,
    claims: [{ statement: '2 + 2 = 4', type: 'FACTUAL', verification: { kinds: ['formal_proof'] } }],
    assumptions: [], evidenceRefs: [], unknowns: [], abstentions: [],
    probabilities: [{ eventId: 'event', domain: 'general', probability: 0.2 }] } };
  if (request.phase === 'REVIEW') return { arguments: [] };
  if (request.phase === 'REVISION') return { changedClaims: [] };
  throw new Error(`Unexpected phase ${request.phase}`);
}

function runtimeInput(db, communityId) {
  return { db, communityId, memberInvoker: invoke,
    verificationExecutor: async ({ claim }) => ({ status: 'VERIFIED', claimId: claim.claimId,
      receiptId: 'oracle-receipt', oracle: 'trusted' }),
    isTrustedReceipt: (receipt) => receipt.oracle === 'trusted' };
}

module.exports = { prepare, invoke, runtimeInput };
