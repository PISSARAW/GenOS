const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../src/db/schema-migrations.js'), 'utf8');
assert.match(source, /COUNT\(\*\) AS count FROM organizations/);
assert.match(source, /GROUP BY workspaces\.name HAVING COUNT\(\*\) = 1/);
assert.doesNotMatch(source, /SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1/);
console.log('Legacy migration ambiguity checks passed.');