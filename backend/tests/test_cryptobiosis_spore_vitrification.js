const assert = require('assert');
const {
  vitrifyState,
  germinateSpore,
  DEFAULT_TREHALOSE_CONCENTRATION
} = require('../src/services/cryptobiosisSporeService');

console.log('[Test] Running test_cryptobiosis_spore_vitrification...');

// 1. Vitrification au tréhalose (stase anhydrobiotique)
const livingCellState = {
  cellId: 'cell-tardigrade-01',
  dissonance: 0.0,
  conscienceBudget: 100.0,
  synapticMemory: [
    { key: 'discovery_route', weight: 0.95 },
    { key: 'immune_antigen', weight: 0.88 }
  ],
  workingTasks: ['analyze_environment', 'secure_perimeter']
};

const spore = vitrifyState(livingCellState, { trehalose: 0.9, armor: 750 });
assert.strictEqual(spore.isVitrified, true);
assert.strictEqual(spore.hydrationLevel, 0.0);
assert.strictEqual(spore.trehaloseConcentration, 0.9);
assert.strictEqual(spore.bunkerArmor, 750);
assert.ok(Buffer.isBuffer(spore.rawBlob) || spore.rawBlob instanceof Uint8Array);
assert.ok(typeof spore.payloadHash === 'string' && spore.payloadHash.length === 64);

// 2. Échec de germination si environnement froid/sec ou sans nutriments
assert.throws(() => {
  germinateSpore(spore, { warmAndWet: false, nutrients: true });
}, /DORMANT/);

assert.throws(() => {
  germinateSpore(spore, { warmAndWet: true, nutrients: false });
}, /DORMANT/);

// 3. Échec d'osmocollapse si concentration de tréhalose trop faible (< 0.2)
const badSpore = vitrifyState(livingCellState, { trehalose: 0.05 });
assert.throws(() => {
  germinateSpore(badSpore, { warmAndWet: true, nutrients: true });
}, /OSMOTIC_COLLAPSE/);

// 4. Germination réussie sous conditions optimales
const revived = germinateSpore(spore, { warmAndWet: true, nutrients: true });
assert.strictEqual(revived.status, 'thawed');
assert.strictEqual(revived.hydrationLevel, 1.0);
assert.deepStrictEqual(revived.state, livingCellState, 'L’état ressuscité doit être 100% identique à l’état vivant d’origine');

console.log('[Test] test_cryptobiosis_spore_vitrification PASSED successfully.');
