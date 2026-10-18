'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'trinity-promotion-integrity-test-secret';

const assert = require('node:assert/strict');
const integrity = require('../src/services/trinityPromotionIntegrity');

async function main() {
  const corruptDb = {
    get: async () => ({ status: 'promoted', decision_json: '{not valid json', failure_reason: null })
  };
  const corrupt = await integrity.previousPromotion({ db: corruptDb, missionId: 'fixture' });
  assert.equal(corrupt.promoted, false);
  assert.equal(corrupt.reason, 'TRINITY_PROMOTION_DECISION_CORRUPT');

  const missingDb = { get: async () => null };
  assert.equal(await integrity.previousPromotion({ db: missingDb, missionId: 'fixture' }), null);

  const nonPromotedDb = {
    get: async () => ({ status: 'decided', decision_json: '{}', failure_reason: null })
  };
  assert.equal(await integrity.previousPromotion({ db: nonPromotedDb, missionId: 'fixture' }), null);

  console.log('Trinity promotion integrity corrupt-decision handling: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});