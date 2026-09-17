'use strict';

const assert = require('node:assert/strict');
const { buildPromotionPolicy } = require('../src/services/philosophyPromotionPolicyService');
const { buildContext } = require('../src/services/philosophicalPromotionGuard');
const { evaluatePromotionGate } = require('../src/services/strategyPromotionPolicyService');

const philosophyContext = buildContext({ references: [{ conceptId: 'metaphysics.qualia' }] });
const contract = {
  promotion: {
    require_independent_verification: false,
    require_philosophical_provenance: true,
    block_unverified_interpretation: true
  },
  philosophy: philosophyContext,
  philosophical_context: buildPromotionPolicy({ philosophyContext: { concepts: [{ conceptId: 'metaphysics.qualia', provenance: { version: '1.0.0', sourceType: 'genos' } }] } })
};

const blocked = evaluatePromotionGate(contract, { report: { claims: [] } });
assert.equal(blocked.eligible, false);
assert.ok(blocked.violations.some((violation) => violation.policy.includes('philosophy')));

const verified = evaluatePromotionGate(contract, {
  independentVerification: true,
  report: { claims: [{ statement: 'verified', evidence: ['test-receipt'] }] }
});
assert.equal(verified.eligible, true);

const policy = buildPromotionPolicy({ philosophyContext: { concepts: [{ conceptId: 'metaphysics.qualia', provenance: { sourceType: 'genos' } }] } });
assert.equal(policy.provenanceComplete, false);

console.log('Philosophical promotion provenance tests passed.');
