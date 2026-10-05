'use strict';

const assert = require('assert');
const selector = require('../src/services/ontogenesis/topologySelector');
const pressure = require('../src/services/ontogenesis/memoryPressure');

// Matrice : huit topologies, variantes admissibles, rôles valides.
const matrix = selector.compatibilityMatrix();
assert.strictEqual(matrix.length, 8);
const ids = matrix.map((row) => row.topology).sort();
assert.deepStrictEqual(ids, ['a_team', 'biocenose', 'biome', 'holobionte', 'metapopulation', 'rhizome', 'syncytium', 'trinity']);
const kinds = require('../src/services/agents/workerKindService');
for (const row of matrix) {
  for (const role of row.workerRoles) assert.ok(kinds.KINDS[role], `rôle inconnu ${role}`);
  assert.ok([1, 2, 3].includes(row.costClass));
}

// Sélection déterministe avec justification.
const implement = selector.selectTopology({
  taskKind: 'implement', allowedTopologies: ['trinity', 'a_team', 'rhizome'],
  availableCapabilities: ['execute', 'coordinate', 'observe', 'verify'],
  memoryLevel: 'normal', failures: []
});
assert.strictEqual(implement.topology, 'a_team');
assert.ok(implement.rationale.some((line) => line.includes('a_team:retenu')));
assert.deepStrictEqual(implement.workerRoles.slice(0, 1), ['sub_orchestrator']);

const trinityDefault = selector.selectTopology({
  taskKind: 'verify', allowedTopologies: ['trinity'],
  availableCapabilities: ['execute', 'verify'], memoryLevel: 'normal', failures: []
});
assert.strictEqual(trinityDefault.variant, 'controlled');

// Capacité manquante : repli explicite vers une topologie admissible.
const degraded = selector.selectTopology({
  taskKind: 'implement', allowedTopologies: ['a_team', 'rhizome'],
  availableCapabilities: ['execute', 'observe'],
  memoryLevel: 'normal', failures: []
});
assert.strictEqual(degraded.topology, 'rhizome');
assert.ok(degraded.rationale.some((line) => line.includes('capacite-manquante:coordinate')));

// Mémoire contrainte : les topologies lourdes sont reportées.
const constrained = selector.selectTopology({
  taskKind: 'decide', allowedTopologies: ['holobionte', 'biocenose'],
  availableCapabilities: ['execute', 'verify', 'coordinate'],
  memoryLevel: 'constrained', failures: []
});
assert.strictEqual(constrained.topology, 'biocenose');

// Échecs répétés : topologie écartée, puis blocage explicite.
const failed = selector.selectTopology({
  taskKind: 'explore', allowedTopologies: ['rhizome'],
  availableCapabilities: ['execute', 'observe'],
  memoryLevel: 'normal', failures: [{ topology: 'rhizome' }, { topology: 'rhizome' }]
});
assert.strictEqual(failed.blocked, 'aucune-topologie-admissible');
assert.ok(failed.rationale.some((line) => line.includes('echecs-repetes')));

// Variante inconnue : repli déclaré vers le défaut.
const variant = selector.selectTopology({
  taskKind: 'implement', allowedTopologies: ['rhizome'],
  availableCapabilities: ['execute', 'observe'],
  memoryLevel: 'normal', failures: [], variant: 'inexistante-xyz'
});
assert.strictEqual(variant.variant, 'default');
assert.ok(variant.rationale.some((line) => line.includes('repli')));

// Mémoire : seuils, hystérésis, admission.
const roomy = { totalMb: 8192, freeMb: 6144, freePct: 0.75, supervisorMb: 200, reservationsMb: 0 };
assert.strictEqual(pressure.classifyLevel(roomy, { reserveMb: 512 }), 'normal');
const tight = { totalMb: 8192, freeMb: 1638, freePct: 0.2, supervisorMb: 200, reservationsMb: 0 };
assert.strictEqual(pressure.classifyLevel(tight, { reserveMb: 512 }), 'constrained');
const critical = { totalMb: 8192, freeMb: 400, freePct: 0.05, supervisorMb: 200, reservationsMb: 0 };
assert.strictEqual(pressure.classifyLevel(critical, { reserveMb: 512 }), 'critical');
const recovering = { totalMb: 8192, freeMb: 2300, freePct: 0.28, supervisorMb: 200, reservationsMb: 0 };
assert.strictEqual(pressure.classifyLevel(recovering, { reserveMb: 512, previous: 'critical' }), 'critical');
assert.strictEqual(pressure.classifyLevel({ totalMb: 8192, freeMb: 3200, freePct: 0.39, supervisorMb: 200, reservationsMb: 0 }, { reserveMb: 512, previous: 'critical' }), 'normal');
const refused = pressure.admitWork({ estimateMb: 100, sample: critical, options: { reserveMb: 512 } });
assert.deepStrictEqual(refused, { admitted: false, level: 'critical', reason: 'memoire-critique' });
const allowed = pressure.admitWork({ estimateMb: 100, sample: roomy, options: { reserveMb: 512 } });
assert.strictEqual(allowed.admitted, true);

// Mesure réelle : la sonde retourne des mégaoctets positifs.
const live = pressure.sampleMemory({ reservationsMb: 0 });
assert.ok(live.totalMb > 0 && live.freeMb >= 0);

console.log('ontogenesis selection checks passed.');
