'use strict';
const assert = require('node:assert/strict');
const { failureState } = require('../src/services/ontogenesis/failurePolicy');
const { ensureJsonExport } = require('../src/services/workerCodeExportRepair');
const { ensureUniqueCategorySelect } = require('../src/services/workerCodeCategorySelectRepair');
const { validateToolArguments } = require('../src/services/mcpArgumentValidation');

async function retryBoundary() {
  let reads = 0;
  const db = { get: async (sql, args) => {
    reads += 1;
    assert.equal(args[0], 'task');
    return { attempt: 2 };
  } };
  const input = { db, run: { task_id: 'task' }, error: { retryable: true }, maxAttempts: 3 };
  assert.equal(await failureState(input), 'PLANNING');
  assert.equal(await failureState({ ...input, maxAttempts: 2 }), 'WAITING_INPUT');
  assert.equal(await failureState({ ...input, error: { retryable: false } }), 'WAITING_INPUT');
  assert.equal(reads, 2, 'a non-retryable failure must not query or reopen a task');
}

function repeatRepairs() {
  const source = '<body><button>Export CSV</button><select name="category"></select><select name="itemCategory"></select></body>';
  const repaired = ensureJsonExport(source);
  assert.equal(ensureJsonExport(source), repaired, 'module-level regexes cannot leak cursor state');
  assert.ok(repaired.includes('onclick="exportPantryJSON()"'));
  assert.ok(repaired.includes('genosJsonExportRepair'));
  assert.equal(ensureJsonExport(repaired), repaired, 'repair remains idempotent');
  const category = ensureUniqueCategorySelect(source);
  assert.equal((category.match(/aria-label="Category"/g) || []).length, 1);
  assert.equal((category.match(/aria-label="Filter category"/g) || []).length, 1);
  assert.equal(ensureUniqueCategorySelect(source), category);
}

function argumentBoundaries() {
  assert.ok(validateToolArguments('genos_replay', {}));
  assert.ok(validateToolArguments('genos_replay', { root: 'C:/capsules/worker', snapshot: 'C:/escape.json' }));
  assert.ok(validateToolArguments('genos_replay', []));
  assert.equal(validateToolArguments('genos_replay', { snapshot: 'sealed.json' }), null);
  assert.ok(validateToolArguments('genos_snapshot', { agent: 'agent.json' }));
}

async function main() {
  await retryBoundary();
  repeatRepairs();
  argumentBoundaries();
  console.log('Quality refactor: retry fence, deterministic repairs and fail-closed argument pipeline: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
