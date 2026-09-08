const assert = require('node:assert/strict');
const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/controllers/platformController.js'), 'utf8');
assert.match(source, /payloadHash = crypto\.createHash\('sha256'\)/);
assert.match(source, /APPROVAL_PAYLOAD_TAMPERED/);
assert.match(source, /approval\.payload_hash !== currentPayloadHash/);
console.log('Approval payload integrity checks passed.');