'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pairedHierarchicalBootstrap, pairedEffectSize, holmCorrection } = require('../evaluation/statistics');
const { parseArguments, requiredScenarioPairs, validateAdapter } = require('../run_campaign');

const pairs = [
  { seed: 1, treatment: 4, control: 2 }, { seed: 1, treatment: 5, control: 3 },
  { seed: 2, treatment: 8, control: 7 }, { seed: 2, treatment: 7, control: 7 }
];
const first = pairedHierarchicalBootstrap(pairs, { seed: 42, replicates: 500 });
const second = pairedHierarchicalBootstrap(pairs, { seed: 42, replicates: 500 });
assert.deepEqual(first, second);
assert.equal(first.estimate, 1.25);
assert.equal(first.seedCount, 2);
assert(first.lower <= first.estimate && first.upper >= first.estimate);
assert(Number.isFinite(pairedEffectSize(pairs).estimate));
assert.deepEqual(pairedEffectSize([{ seed: 1, treatment: 1, control: 1 }]),
  { estimate: null, reason: 'zero_variance' });
assert.throws(() => pairedHierarchicalBootstrap(pairs, { confidence: 1 }), /between zero and one/);
assert.throws(() => pairedHierarchicalBootstrap(pairs, { replicates: 0 }), /positive integer/);

const corrected = holmCorrection([{ id: 'a', pValue: 0.01 },
  { id: 'b', pValue: 0.04 }, { id: 'c', pValue: 0.03 }]);
assert.deepEqual(corrected.map((item) => item.adjustedPValue), [0.03, 0.06, 0.06]);
assert.throws(() => holmCorrection([{ id: 'a', pValue: 1.2 }]), /p-values in/);
assert.throws(() => parseArguments(['--adapter', 'provider.js']), /Usage:/);
assert.throws(() => validateAdapter({}), /missing: protocol/);
const scenarioCases = requiredScenarioPairs().map((pair) => {
  const [scenarioId, difficulty] = pair.split(':');
  return { scenarioId, difficulty };
});
const adapter = { metricSet: {}, runtime: {}, providers: {},
  replications: Array.from({ length: 30 }, (_, seed) => ({ seed, holdout: true })), cases: scenarioCases,
  protocol: { corpus: { reserved: { availableForTuning: true } } } };
assert.throws(() => validateAdapter(adapter),
  /unavailable for tuning/);
adapter.protocol.corpus.reserved.availableForTuning = false;
adapter.replications = adapter.replications.slice(0, 29);
assert.throws(() => validateAdapter(adapter), /30 independent replications/);
adapter.replications.push({ seed: 29, holdout: true });
adapter.cases = adapter.cases.slice(0, 35);
assert.throws(() => validateAdapter(adapter), /lacks scenario coverage/);
adapter.cases.push(scenarioCases[35]);
assert.doesNotThrow(() => validateAdapter(adapter));
const scenarioRoot = path.join(__dirname, '../scenarios');
const scenarios = fs.readdirSync(scenarioRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => JSON.parse(fs.readFileSync(
    path.join(scenarioRoot, entry.name, 'scenario.json'), 'utf8')));
assert.equal(scenarios.length, 12);
assert.equal(scenarios.filter((scenario) => scenario.priority).length, 4);
assert(scenarios.every((scenario) => scenario.levels.length === 3));
console.log('ETT benchmark bootstrap, Holm correction and CLI contract checks passed.');
