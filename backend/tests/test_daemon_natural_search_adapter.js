'use strict';

const assert = require('node:assert/strict');
const adapter = require('../src/services/daemon/daemonNaturalSearchAdapter');
const { HypothesisLedger } = require('../src/services/search/hypothesisLedgerService');
const { SearchPressureModel } = require('../src/services/search/searchPressureService');

function observation() {
  return {
    daemonId: 'daemon.resident-1',
    territoryId: 'territory.ns-test',
    headSha: 'a'.repeat(40),
    detectorId: 'test-regression',
    claim: 'suite auth fails deterministically since commit range',
    scope: { type: 'test', value: 'backend/tests/auth.test.js' },
    falsification: 'suite passes on next run without code change'
  };
}

async function main() {
  // 1. Hash stable et discriminant
  const h1 = adapter.observationHash(observation());
  const h2 = adapter.observationHash(observation());
  assert.equal(h1, h2);
  assert.equal(h1.length, 16);
  assert.notEqual(h1, adapter.observationHash({ ...observation(), claim: 'different claim' }));

  // 2. Construction input : claim → statement, scope → prediction
  const input = adapter.buildHypothesisInput(observation());
  assert.equal(input.statement, observation().claim);
  assert.ok(input.prediction.includes('backend/tests/auth.test.js'));
  assert.equal(input.observationHash, h1);

  // 3. Proposition dans le vrai ledger (aucun moteur dupliqué)
  const ledger = new HypothesisLedger();
  const res = adapter.proposeFromObservation(ledger, observation());
  assert.equal(res.proposed, true);
  assert.ok(res.hypothesisId);
  assert.equal(res.status, 'proposed');

  // 4. Observation invalide : refus propre
  assert.equal(adapter.proposeFromObservation(ledger, { territoryId: 't' }).proposed, false);
  assert.equal(adapter.proposeFromObservation(null, observation()).proposed, false);

  // 5. Mapping signaux → pression Natural Search
  const mapped = adapter.mapTerritoryToPressure({ repeatedFailures: 4, refutedFindings: 1, contradictingEvidence: 2 });
  assert.equal(mapped.stepsSinceProgress, 4);
  assert.equal(mapped.falsifiedHypotheses, 1);
  assert.equal(mapped.contradictions, 2);

  // 6. Pression réelle : signaux de stall → pressure > 0 + causes
  const model = new SearchPressureModel();
  const pressured = adapter.reportTerritoryPressure(model, { repeatedFailures: 5, refutedFindings: 2, contradictingEvidence: 1 });
  assert.equal(pressured.reported, true);
  assert.ok(pressured.pressure > 0);
  assert.ok(pressured.causes.length > 0);

  // 7. Territoire calme → pression nulle, pas d'escalade
  const calm = adapter.reportTerritoryPressure(new SearchPressureModel(), {});
  assert.equal(calm.reported, true);
  assert.equal(calm.pressure, 0);

  // 8. Sans modèle : échec doux
  assert.equal(adapter.reportTerritoryPressure(null, {}).reported, false);

  console.log('Daemon Natural Search adapter tests passed (ledger propose, pressure mapping).');
}

main().catch((error) => { console.error(error); process.exit(1); });
