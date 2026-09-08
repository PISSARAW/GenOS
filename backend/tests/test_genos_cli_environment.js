const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cliPath = path.resolve(__dirname, '../src/services/genosCli.js');
const source = fs.readFileSync(cliPath, 'utf8');

assert.match(source, /SAFE_GENOS_ENV/);
assert.match(source, /!\/\(TOKEN\|SECRET\|KEY\|PASSWORD\|CREDENTIAL\|API\)/);
assert.doesNotMatch(source, /env:\s*\{\.\.\.process\.env/);
console.log('GenOS CLI environment filtering checks passed.');