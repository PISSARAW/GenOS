'use strict';

const assert = require('node:assert/strict');
const economy = require('../src/services/cognitiveEconomyControllerService');
const omega = require('../src/services/cognitiveOmegaCompiler');

assert.equal(economy.TOPOLOGIES.length, 8);
assert.equal(economy.forAgow({ risk: 0.2 }).topology, 'holobionte');
assert.equal(economy.forMorphogenesis({ risk: 0.2 }).topology, 'syncytium');
assert.equal(economy.forRpe({ risk: 0.2 }).topology, 'syncytium');
assert.equal(economy.forNaturalSearch({ risk: 0.2 }).topology, 'rhizome');
assert.equal(economy.plan({ risk: 0.05 }).level, 'L0');
assert.equal(economy.plan({ risk: 0.9 }).level, 'L5');
assert.equal(economy.plan({ risk: 0.9, level: 'L1' }).level, 'L5');
const measured = economy.observe({ integration: 'agow', risk: 0.4, tokens: 500,
  latencyMs: 100, quality: 0.9 });
assert.equal(measured.measured.tokens, 500);
assert.equal(measured.measuredRoi > 0, true);
const contract = omega.compilePrompt({ prompt: 'task', program: [{ id: 'read', kind: 'READ' }],
  economy: economy.forRpe({ risk: 0.7 }) });
assert.equal(contract.economy.topology, 'syncytium');
assert.equal(contract.economy.level, 'L4');
assert.equal(contract.economy.execution.verificationPasses, 2);
assert.equal(contract.economy.execution.allowEmit, true);
const graph = [{ id: 'infer', kind: 'INFER', dependsOn: [] },
  { id: 'check', kind: 'CHECK', reference: 'epistemic/runtime', dependsOn: ['infer'] },
  { id: 'emit', kind: 'EMIT', reference: 'runtime.commit', dependsOn: ['check'] }];
assert.deepEqual(economy.shapeOperations(graph, economy.plan({ level: 'L0' })).map((item) => item.kind), ['INFER']);
assert.deepEqual(economy.shapeOperations(graph, economy.plan({ level: 'L5' }))
  .map((item) => item.kind), ['INFER', 'CHECK', 'CHECK', 'CHECK', 'EMIT']);
console.log('Cognitive economy controller checks passed.');
