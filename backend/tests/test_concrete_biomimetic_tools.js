const assert = require('assert');
const { executeBioExtra } = require('../src/services/mcpBioExtra');

(async () => {
  const genetics = executeBioExtra('genos_quantitative_genetics', {
    observations: [
      { genotype: 1, phenotype: 2 },
      { genotype: 2, phenotype: 4 },
      { genotype: 3, phenotype: 6 }
    ]
  });
  assert.equal(genetics.success, true);
  assert.equal(genetics.evidence.method, 'pearson_correlation_squared');
  assert.equal(genetics.heritabilityProxy, 1);

  const fusion = executeBioExtra('genos_multisensory_integration', {
    signals: [{ value: 10, weight: 1 }, { value: 20, weight: 3 }]
  });
  assert.equal(fusion.success, true);
  assert.equal(fusion.integrated, 17.5);

  const route = executeBioExtra('genos_routing_algorithm', {
    start: 'a', target: 'd', graph: { a: ['b', 'c'], b: ['d'], c: ['d'], d: [] }
  });
  assert.deepStrictEqual(route.route, ['a', 'b', 'd']);

  const trust = executeBioExtra('genos_social_trust', { positive: 3, negative: 1 });
  assert.equal(trust.success, true);
  assert.equal(trust.trust, 0.6666666666666666);

  console.log('Concrete biomimetic tools passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });