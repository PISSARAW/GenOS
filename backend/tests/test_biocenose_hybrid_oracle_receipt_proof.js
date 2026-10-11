'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const fixture = require('./helpers/biocenoseCompletionFixtures');
const { signedOracleReceipt } = require('./helpers/biocenoseHybridReceipt');
const gate = require('../src/services/biocenose/judgment/promotionGateService');
const communityStore = require('../src/services/biocenose/communityStore');
const service = require('../src/services/biocenoseService');
const { select } = require('../src/services/biocenose/variants/variantPolicyRouter');

async function evaluate(input) {
  const { db, session, claim, receipt } = input;
  return gate.evaluate({ db, variantPolicy: select('hybrid_oracle_community'),
    aggregation: { questionType: 'FACTUAL', outcome: 'EVIDENCE_SUPPORTED',
      verifiedClaimIds: [claim.claimId] }, verificationReceipts: [receipt],
    isTrustedReceipt: () => true }, session, [claim]);
}

async function run() {
  const previousKey = process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'biocenose-gate-test-only';
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const community = await fixture.prepare(db, { variant: 'hybrid_oracle_community',
      questionType: 'FACTUAL' });
    const session = await communityStore.loadSession(db, community.communityId);
    await assert.rejects(service.runBiocenoseRound({ db, communityId: session.communityId,
      handlers: { review_and_verify: async () => ({ verificationReceipts: [] }) } }),
    (error) => error.code === 'BIOCENOSE_HYBRID_ORACLE_HANDLER_OVERRIDE_FORBIDDEN');
    const verifier = session.members.find((member) => member.role === 'verifier');
    const claim = { claimId: 'fact-1', claim: { statement: '2 + 2 = 4',
      type: 'FACTUAL', verification: { kinds: ['formal_proof'] } } };
    const receipt = signedOracleReceipt({ claim, verifier, session });
    assert.equal((await evaluate({ db, session, claim, receipt })).gate.status, 'ALLOWED');
    assert.equal((await evaluate({ db, session, claim, receipt: { ...receipt,
      epistemicReceipt: null } })).gate.status,
      'REVIEW_REQUIRED');
    assert.equal((await evaluate({ db, session, claim: { ...claim,
      claim: { ...claim.claim, statement: '2 + 2 = 5' } }, receipt })).gate.status, 'REVIEW_REQUIRED');
    assert.equal((await evaluate({ db, session: { ...session, round: session.round + 1 },
      claim, receipt })).gate.status,
      'REVIEW_REQUIRED');
    delete process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
    assert.equal((await evaluate({ db, session, claim, receipt })).gate.status, 'REVIEW_REQUIRED');
  } finally {
    await db.close();
    if (previousKey === undefined) delete process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
    else process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = previousKey;
  }
  console.log('Biocenose Hybrid Oracle signed receipt gate: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
