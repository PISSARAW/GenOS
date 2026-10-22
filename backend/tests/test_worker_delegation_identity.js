const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const deployHelpers = fs.readFileSync(path.resolve(__dirname, '../src/controllers/deployHelpers.js'), 'utf8');
assert.match(deployHelpers, /role: params\.agent\.role/);
assert.doesNotMatch(deployHelpers, /role: params\.req\.body\?\.role/);
const garage = fs.readFileSync(path.resolve(__dirname, '../src/services/workerGarageService.js'), 'utf8');
assert.match(garage, /workspace_id IS \(SELECT workspace_id FROM agents WHERE id = \?\) OR workspace_id IS NULL/);
console.log('Worker delegation preserves identity and workspace scope.');
