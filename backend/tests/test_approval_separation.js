const assert = require('node:assert/strict');
const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/controllers/platformController.js'), 'utf8');
assert.match(source, /APPROVAL_SEPARATION_REQUIRED/);
assert.match(source, /approval\.requested_by === decisionBy/);
console.log('Approval separation checks passed.');