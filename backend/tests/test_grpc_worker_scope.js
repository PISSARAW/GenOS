const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../src/grpc_services/orchestratorService.js'), 'utf8');
assert.match(source, /ww\.organization_id IS wo\.organization_id/);
assert.match(source, /ww\.project_id IS wo\.project_id/);
console.log('gRPC worker delegation compares legacy tenant scopes safely.');