const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const deployHelpers = fs.readFileSync(path.resolve(__dirname,
  '../src/controllers/deployHelpers.js'), 'utf8');
assert.match(deployHelpers, /garage\.enterIdleState\(opts\.db, opts\.workerId, opts\.orchestratorId\)/);
assert.match(deployHelpers, /Dispatch failed:/);

const grpcOrchestrator = fs.readFileSync(path.resolve(__dirname,
  '../src/grpc_services/orchestratorService.js'), 'utf8');
assert.match(grpcOrchestrator, /catch \(error\) \{\s*if \(workspaceRoot\) await rollbackDispatchWorkspace\(db, worker, workspaceRoot\);\s*throw error;/);
assert.match(grpcOrchestrator, /async function rollbackDispatchWorkspace\(/);
console.log('Failed worker dispatches release their reservation.');
