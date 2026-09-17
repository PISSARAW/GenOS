'use strict';

const assert = require('assert');
const justice = require('../src/services/justiceEthicsService');
const relational = require('../src/services/relationalEthicsService');

const rawls = justice.evaluateRawlsianJustice({ distribution: { a: 2, b: 8, c: 4 } });
assert.strictEqual(rawls.framework, 'rawlsian-justice');
assert.strictEqual(rawls.worstOff, 2);
assert.strictEqual(rawls.verdict, 'evaluated-from-worst-off-position');

const distribution = justice.evaluateDistributiveJustice({ allocations: { a: 5, b: 5 }, principle: 'sufficientarianism', sufficientLevel: 5 });
assert.strictEqual(distribution.sufficient, true);
assert.strictEqual(distribution.verdict, 'sufficient');

const rights = justice.evaluateRights({ action: { id: 'deploy' }, rights: ['consent'], infringements: [] });
assert.strictEqual(rights.verdict, 'rights-compatible');

const contract = justice.evaluateSocialContract({ theorist: 'rousseau', consent: true, mutualBenefit: true });
assert.strictEqual(contract.legitimacy, 'legitimate-by-contract');

const entitlement = justice.evaluateLibertarianEntitlement({ coercion: true });
assert.strictEqual(entitlement.verdict, 'entitlement-violation');

const care = relational.assessCare({ actor: 'agent-a', recipient: 'agent-b', need: 0.8, vulnerability: 0.9, response: 0.9 });
assert.strictEqual(care.verdict, 'care-responsive');

const duty = relational.evaluateCareDuty({ actor: 'agent-a', recipient: 'agent-b', need: 0.8, response: 0.9 });
assert.strictEqual(duty.verdict, 'duty-satisfied');

const other = relational.evaluateResponsibilityForOther({ actor: 'agent-a', other: 'agent-b', faceToFace: true, vulnerability: 0.7 });
assert.strictEqual(other.verdict, 'responsibility-awakened');

console.log('Justice and relational ethics tests passed.');
