'use strict';

const assert = require('node:assert/strict');
const learning = require('../../src/services/morphogenesis/learning');
const { MorphologyExperienceStore, createExperience } = learning.morphologyExperienceStore;
const { MorphologyPriorService } = learning.morphologyPriorService;
const { OutcomeModel } = learning.outcomeModel;
const { PolicyLearner } = learning.policyLearner;

async function main() {
  // --- MorphologyExperienceStore ---
  const store = new MorphologyExperienceStore({ maxSize: 100 });
  const exp = createExperience({
    missionSignature: 'm1',
    initialMorphology: { topology: 'trinity' },
    finalOutcome: 'success',
    tokens: 50, latency: 10, quality: 0.8
  });
  store.add(exp);
  assert.strictEqual(store.getAll().length, 1);
  const stats = store.getStats('trinity');
  assert.strictEqual(stats.count, 1);
  assert.strictEqual(stats.avgTokens, 50);

  // Indexing
  store.add(createExperience({ missionSignature: 'b', initialMorphology: { topology: 'rhizome' }, finalOutcome: 'success' }));
  assert.strictEqual(store.getByTopology('trinity').length, 1);

  // Invalid experience
  assert.throws(() => createExperience({}), /Invalid experience/);

  // --- MorphologyPriorService ---
  const ps = new MorphologyPriorService();
  ps.update('key1', 1, 'outcome');
  ps.update('key1', 0, 'outcome');
  const prior = ps.getPrior('key1');
  assert.strictEqual(prior.count, 2);
  assert.strictEqual(prior.mean, 0.5);

  // Unseen key returns global prior
  const unseen = ps.getPrior('nonexistent');
  assert.strictEqual(unseen.count, 0);

  // Confidence interval
  const ci = ps.getConfidenceInterval('key1');
  assert.ok(ci.lower >= 0);
  assert.ok(ci.upper <= 1);

  // --- OutcomeModel ---
  const om = new OutcomeModel();
  om.learnFromExperience(exp);
  const pred = om.predict({ topology: 'trinity' });
  assert.strictEqual(pred.outcome.total, 1);
  assert.strictEqual(pred.outcome.successRate, 1);

  // Transition prediction
  const tpred = om.predictTransition('trinity', 'rhizome', {});
  assert.ok(typeof tpred.predictedBenefit === 'number');

  // --- PolicyLearner ---
  const pl = new PolicyLearner({ useBandit: false });
  const action = pl.selectAction({});
  assert.ok(pl.actionSpace.includes(action));

  // Blocked actions
  const pl2 = new PolicyLearner({ useBandit: false });
  const action2 = pl2.selectAction({ constraints: { blocked: ['trinity'] } });
  assert.notStrictEqual(action2, 'trinity');

  // Record outcome and get values
  pl.recordOutcome('trinity', { topology: 'default' }, 1);
  const values = pl.getActionValues({ topology: 'default' });
  assert.strictEqual(values.length, pl.actionSpace.length);

  // Record transition
  const pl3 = new PolicyLearner();
  pl3.recordTransition('trinity', 'rhizome', {}, 0.8, 10);
  const tvals = pl3.getTransitionValues('trinity', {});
  assert.ok(tvals.rhizome);
  assert.strictEqual(tvals.rhizome.benefit, 0.8);

  // --- Module exports check ---
  assert.ok(learning.morphologyExperienceStore.MorphologyExperienceStore);
  assert.ok(learning.morphologyPriorService.MorphologyPriorService);
  assert.ok(learning.outcomeModel.OutcomeModel);
  assert.ok(learning.policyLearner.PolicyLearner);
}

main()
  .then(() => console.log('Morphology learning services: PASS'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
