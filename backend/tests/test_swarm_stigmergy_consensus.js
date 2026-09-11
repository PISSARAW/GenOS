const assert = require('assert');
const { createSwarmMatrix } = require('../src/services/swarmStigmergyVectorService');

console.log('[Test] Running test_swarm_stigmergy_consensus...');

const matrix = createSwarmMatrix(60000);

// 1. Dépôt de phéromones positives sur un chemin A
matrix.depositTrace('path_refactor_core', 25.0);
matrix.depositTrace('path_refactor_core', 15.0);
let sel = matrix.selectDominantPath();
assert.strictEqual(sel.dominantPath, 'path_refactor_core');
assert.ok(sel.intensity >= 39.0);

// 2. Dépôt de phéromone répulsive (anti-stigmergie) sur un chemin risqué B
matrix.depositTrace('path_dangerous_bypass', 50.0, true);
assert.ok(matrix.getDecayedIntensity('path_dangerous_bypass') < 0, 'La trace répulsive doit être négative');
sel = matrix.selectDominantPath();
assert.strictEqual(sel.dominantPath, 'path_refactor_core', 'Le chemin dominant ne doit pas sélectionner un chemin répulsif');

// 3. Test de synchronisation par phase de Kuramoto (consensus émergent)
// Aligner 4 agents sur des phases proches (ex: 0.1 rad)
matrix.alignOscillator('agent_1', 0.1);
matrix.alignOscillator('agent_2', 0.12);
matrix.alignOscillator('agent_3', 0.08);
matrix.alignOscillator('agent_4', 0.11);

const order = matrix.computeKuramotoOrder();
assert.strictEqual(order.agentCount, 4);
assert.ok(order.orderParameter > 0.95, `Le paramètre d'ordre de Kuramoto (${order.orderParameter}) doit être > 0.95 pour des oscillateurs synchronisés`);

console.log('[Test] test_swarm_stigmergy_consensus PASSED successfully.');
