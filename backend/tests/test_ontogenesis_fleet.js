'use strict';

const assert = require('assert');
const fleet = require('../src/services/ontogenesis/fleetService');

const roomy = { totalMb: 16384, freeMb: 12288, freePct: 0.75, supervisorMb: 200, reservationsMb: 0 };

// Priorité décroissante, stable à égalité ; l'enveloppe s'épuise.
const shared = fleet.arbitrate({
  sample: roomy,
  options: { reserveMb: 512 },
  requests: [
    { projectId: 'faible', priority: 1, estimateMb: 2000 },
    { projectId: 'haute', priority: 10, estimateMb: 2000 },
    { projectId: 'gourmand', priority: 5, estimateMb: 20000 }
  ]
});
assert.deepStrictEqual(shared.admissions.map((row) => row.projectId), ['haute', 'gourmand', 'faible']);
assert.strictEqual(shared.admissions[0].admitted, true);
assert.strictEqual(shared.admissions[1].admitted, false);
assert.strictEqual(shared.admissions[1].reason, 'enveloppe-insuffisante');
assert.strictEqual(shared.admissions[2].admitted, true);
assert.strictEqual(shared.reservationsMb, 4000);

// Réservations déjà admises comptées avant le tour.
const withPrior = fleet.arbitrate({
  sample: { ...roomy, reservationsMb: 11000 },
  options: { reserveMb: 512 },
  requests: [{ projectId: 'tardif', priority: 1, estimateMb: 2000 }]
});
assert.strictEqual(withPrior.admissions[0].admitted, false);

// Critique : tout le monde attend, sans exception de priorité.
const critical = { totalMb: 8192, freeMb: 400, freePct: 0.05, supervisorMb: 200, reservationsMb: 0 };
const frozen = fleet.arbitrate({
  sample: critical,
  options: { reserveMb: 512 },
  requests: [{ projectId: 'urgent', priority: 99, estimateMb: 1 }]
});
assert.strictEqual(frozen.admissions[0].admitted, false);
assert.strictEqual(frozen.admissions[0].reason, 'memoire-critique');

// Vide : aucun arbitrage, aucune réservation.
assert.deepStrictEqual(fleet.arbitrate({ sample: roomy, options: {}, requests: [] }), { admissions: [], reservationsMb: 0 });

console.log('ontogenesis fleet checks passed.');
