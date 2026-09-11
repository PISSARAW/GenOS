const assert = require('assert');
const { createCytoplasm } = require('../src/services/syncytiumCytoplasmService');

console.log('[Test] Running test_syncytium_ionic_flux...');

const cytoplasm = createCytoplasm();

// 1. Test état initial de repos (-70mV)
const initial = cytoplasm.snapshotState();
assert.strictEqual(initial.membranePotentialMv, -70.0);
assert.ok(initial.ions['Ca2+']);
assert.ok(initial.ions['K+']);
assert.ok(initial.ions['Na+']);

// 2. Test propagation de flux ionique Ca2+ (dépolarisation vers le seuil d'excitation)
const fluxResult = cytoplasm.propagateIonicFlux('Ca2+', 1.5, 'agent_alpha');
assert.strictEqual(fluxResult.ion, 'Ca2+');
assert.ok(fluxResult.gradient > 0);
assert.ok(fluxResult.membranePotentialMv > -70.0, 'L’afflux de calcium doit dépolariser la membrane');

// 3. Test diffusion moléculaire vectorielle (ex: gradient d'ATP/morphogène)
const diffResult = cytoplasm.diffuseMolecule('ATP', [1.0, 0.5, 0.2]);
assert.strictEqual(diffResult.molecule, 'ATP');
assert.strictEqual(diffResult.vector.length, 3);
assert.ok(diffResult.vector[0] > 0);

// 4. Test snapshot de cohérence continue
const snap = cytoplasm.snapshotState();
assert.ok(snap.ions['Ca2+'].fluxCount >= 1);
assert.ok(snap.molecules['ATP']);

console.log('[Test] test_syncytium_ionic_flux PASSED successfully.');
