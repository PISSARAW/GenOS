'use strict';

const assert = require('assert');
const service = require('../src/services/normativeEthicsService');

const action = { id: 'review', description: 'review evidence' };

const act = service.evaluateActUtilitarianism({
  action,
  outcomes: [{ utility: 10, probability: 0.8 }, { utility: -2, probability: 0.2 }],
});
assert.strictEqual(act.framework, 'act-utilitarianism');
assert.strictEqual(act.utility, 7.6);
assert.strictEqual(act.executable, false);

const rule = service.evaluateRuleUtilitarianism({ action, rule: 'protect evidence integrity', expectedOutcomes: [{ utility: 2 }] });
assert.strictEqual(rule.framework, 'rule-utilitarianism');
assert.strictEqual(rule.verdict, 'rule-supported');

const kant = service.evaluateCategoricalImperative({ action, maxim: 'Je peux falsifier une preuve pour gagner du temps', contradiction: true });
assert.strictEqual(kant.universalizable, false);
assert.strictEqual(kant.verdict, 'impermissible');

const doubleEffect = service.evaluateDoubleEffect({ action, intendedGood: true, foreseenHarm: true, proportionality: true, alternativesExhausted: true });
assert.strictEqual(doubleEffect.verdict, 'permissible-under-double-effect');

const virtue = service.assessVirtueEthics({ agentId: 'agent-1', virtues: { wisdom: 0.9, courage: 0.8, temperance: 0.7, justice: 0.9 } });
assert.strictEqual(virtue.verdict, 'flourishing-character');

console.log('Normative ethics service tests passed.');
