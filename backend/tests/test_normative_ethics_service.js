'use strict';

const assert = require('assert');
const service = require('../src/services/normativeEthicsService');

const action = { id: 'review', description: 'review evidence' };

// Act utilitaire
const act = service.evaluateActUtilitarianism({
  action,
  outcomes: [{ utility: 10, probability: 0.8 }, { utility: -2, probability: 0.2 }],
});
assert.strictEqual(act.framework, 'act-utilitarianism');
assert.strictEqual(act.utility, 7.6);
assert.strictEqual(act.executable, false);
assert.ok(act.assessment && act.assessment.type === 'utilitarian-assessment');
assert.ok(!('verdict' in act));

// Rule utilitaire
const rule = service.evaluateRuleUtilitarianism({ action, rule: 'protect evidence integrity', expectedOutcomes: [{ utility: 2 }] });
assert.strictEqual(rule.framework, 'rule-utilitarianism');
assert.strictEqual(rule.ruleAssessment.supported, true);
assert.strictEqual(rule.utility, 2);
assert.ok(!('verdict' in rule));

// Imperatif catégorique (contradiction → non universalisable)
const kant = service.evaluateCategoricalImperative({ action, maxim: 'Je peux falsifier une preuve pour gagner du temps', contradiction: true });
assert.strictEqual(kant.framework, 'kantian-deontology');
assert.strictEqual(kant.universalizable, false);
assert.strictEqual(kant.respectsPersons, true);
assert.ok(kant.assessment && kant.assessment.type === 'categorical-imperative-assessment');
assert.ok(!('verdict' in kant));

// Double effet (toutes conditions remplies → permitted)
const doubleEffect = service.evaluateDoubleEffect({ action, intendedGood: true, foreseenHarm: true, proportionality: true, alternativesExhausted: true });
assert.strictEqual(doubleEffect.framework, 'doctrine-of-double-effect');
assert.strictEqual(doubleEffect.assessment.permitted, true);
assert.ok(doubleEffect.assessment.conditions);
assert.ok(!('verdict' in doubleEffect));

// Vertus (scores élevés → lecture florissante)
const virtue = service.assessVirtueEthics({ agentId: 'agent-1', virtues: { wisdom: 0.9, courage: 0.8, temperance: 0.7, justice: 0.9 } });
assert.strictEqual(virtue.framework, 'virtue-ethics');
assert.ok(virtue.eudaimoniaScore > 0.7);
assert.ok(virtue.assessment && virtue.assessment.type === 'virtue-ethics-reading');
assert.ok(virtue.assessment.mean > 0.7);
assert.ok(!('verdict' in virtue));

console.log('Normative ethics service tests passed (assessment contract, no verdict).');
