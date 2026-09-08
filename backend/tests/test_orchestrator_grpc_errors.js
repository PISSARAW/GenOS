const assert = require('node:assert/strict');
const service = require('../src/grpc_services/orchestratorService');

service.DispatchWorker({ request: {} }, (error, value) => {
  assert.equal(error.code, 3);
  assert.match(error.message, /orchestrator_id/);
  assert.equal(value, undefined);
  console.log('Orchestrator gRPC validation errors use the RPC error channel.');
});