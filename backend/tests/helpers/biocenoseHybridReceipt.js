'use strict';

const proof = require('../../src/services/biocenose/verification/hybridOracleReceiptProof');
const { issueReceipt } = require('../../src/services/epistemicVerifierReceiptService');
const { listVerifierDigests } = require('../../src/services/verifierTrustRegistry');

function signedOracleReceipt(input) {
  const { claim, verifier, session } = input;
  const receipt = { status: 'VERIFIED', receiptId: input.receiptId || 'r2',
    claimId: claim.claimId, verifierId: verifier.memberId, communityId: session.communityId,
    round: session.round, evidenceRef: input.evidenceRef || 'proof:r2', oracle: 'trusted' };
  return { ...receipt, epistemicReceipt: issueReceipt({ resultId: receipt.receiptId,
    evidenceDigest: proof.bindingDigest({ claim, receipt, session }),
    verifierDigest: listVerifierDigests()[0], status: 'verified',
    independent: input.independent === true }) };
}

module.exports = { signedOracleReceipt };
