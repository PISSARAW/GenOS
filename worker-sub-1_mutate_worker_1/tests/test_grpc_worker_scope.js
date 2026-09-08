const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../src/grpc_services/orchestratorService.js'), 'utf8');
assert.match(source, /ww\.organization_id\s*=\s*wo\.organization_id/);
assert.match(source, /ww\.project_id\s*=\s*wo\.project_id/);
assert.match(source, /ww\.organization_id\s+IS\s+NOT\s+NULL/);
assert.match(source, /ww\.project_id\s+IS\s+NOT\s+NULL/);
assert.doesNotMatch(source, /ww\.organization_id\s+IS\s+wo\.organization_id/);
assert.doesNotMatch(source, /ww\.project_id\s+IS\s+wo\.project_id/);
console.log('gRPC worker delegation requires non-null matching tenant scopes.');