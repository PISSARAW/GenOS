const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

for (const relativePath of [
  '../src/grpc_services/orchestratorService.js',
  '../src/controllers/deployController.js'
]) {
  const source = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
  assert.match(source, /SET status='idle', current_task=\?/);
  assert.match(source, /Dispatch failed:/);
}
console.log('Failed worker dispatches release their reservation.');