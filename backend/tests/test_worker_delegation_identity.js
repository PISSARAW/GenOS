const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/deployController.js'), 'utf8');
assert.match(controller, /role: scopedPair\.role/);
assert.doesNotMatch(controller, /role: req\.body\.role \|\| scopedPair\.role/);
const garage = fs.readFileSync(path.resolve(__dirname, '../src/services/workerGarageService.js'), 'utf8');
assert.match(garage, /workspace_id = \(SELECT workspace_id FROM agents WHERE id = \?\)/);
console.log('Worker delegation preserves identity and workspace scope.');