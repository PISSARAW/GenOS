const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/services/agentWorkspaceLifecycleService.js'), 'utf8');

assert.match(source, /SENSITIVE_BASENAME/);
assert.match(source, /removeSensitiveFiles/);
assert.match(source, /\.env/);
assert.match(source, /id_rsa/);
console.log('Workspace sensitive-file exclusion checks passed.');