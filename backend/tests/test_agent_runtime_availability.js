const assert = require('node:assert/strict');
const runtime = require('../src/services/agentRuntimeExecutable');

const unavailable = runtime.runtimeAvailability('genos-command-that-does-not-exist');
assert.equal(unavailable.available, false);
assert.match(unavailable.reason, /unavailable/);

const missingScript = runtime.runtimeAvailability('C:\\missing\\runtime.cjs');
assert.equal(missingScript.available, false);
assert.match(missingScript.reason, /not found/);
console.log('Agent runtime availability rejects missing executables.');