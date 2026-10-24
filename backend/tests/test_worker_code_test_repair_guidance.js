'use strict';

const assert = require('node:assert/strict');
const { build } = require('../src/services/workerCodeTestRepairSchemaFeedback');

const error = Object.assign(new Error("Exact edit anchor must occur once in 'backend/src/worker.js'."), {
  code: 'WORKER_OUTPUT_SCHEMA_VIOLATION',
  workerArtifactDiagnostics: { error: "Exact edit anchor must occur once in 'backend/src/worker.js'." }
});
const feedback = build(error, { allowedPatchPaths: ['backend/src/worker.js'] });
assert.match(feedback, /only allowed production patch paths/);
assert.match(feedback, /do not copy its anchor from the rejected output or a rolled-back candidate/);
assert.match(feedback, /For a small file whose full contents are present, prefer a full-file replacement/);
assert.match(feedback, /Otherwise copy a unique anchor exactly from the current file/);
assert.match(feedback, /Re-evaluate the failing assertion/);
const wrongPath = Object.assign(new Error('Model output did not satisfy the requested worker evidence schema.'), {
  code: 'WORKER_OUTPUT_SCHEMA_VIOLATION',
  workerArtifactDiagnostics: { violations: ['/patches/0/path must be equal to constant'] }
});
assert.match(build(wrongPath, { requiredPatchPaths: ['index.html'] }), /required production patch paths are exactly \["index.html"\]/);
process.stdout.write('Code worker retries include bounded patch paths and anchor recovery guidance.\n');
