const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../src/db');
const service = require('../src/services/evaluationObservabilityService');

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-impossible-model-'));
  const db = await getDatabase(path.join(directory, 'evaluation.db'));
  const result = await service.runImpossibleBench({
    cases: [{ id: 'case-1', prompt: 'answerable', impossible: false }],
    generate: async () => ({ model: 'ollama://verified-model', text: '{"confidence":0.9}' })
  });
  assert.equal(result.modelVersion, 'ollama://verified-model');
  assert.equal(result.results[0].modelVersion, 'ollama://verified-model');
  const row = await db.get('SELECT model_version FROM evaluation_runs WHERE id = ?', result.id);
  assert.equal(row.model_version, 'ollama://verified-model');
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
  console.log('ImpossibleBench persists the selected model identity.');
})().catch((error) => { console.error(error); process.exitCode = 1; });