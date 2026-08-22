const assert = require('assert');
const { getDatabase, closeDatabase } = require('./src/db');
const service = require('./src/services/evaluationObservabilityService');

async function run() {
  await getDatabase(':memory:');
  const result = await service.runImpossibleBench({ abstentionThreshold: 0.65 });
  assert.strictEqual(result.benchmark, 'ImpossibleBench');
  assert.strictEqual(result.results.length, 3);
  assert.ok(result.results.filter(item => item.abstained).length >= 2);
  assert.ok(result.brierScore >= 0 && result.brierScore <= 1);
  const overview = await service.overview();
  assert.ok(overview.provenance.some(item => item.subject_id === result.id));
  assert.ok(overview.notifications.some(item => item.event_type === 'human_escalation'));
  await closeDatabase();
  console.log('evaluation observability: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
