const assert = require('node:assert/strict');
const { grpcStatusForError } = require('../src/grpc_services/agentService');

assert.equal(grpcStatusForError({ code: 'ALREADY_EXISTS' }), 6);
assert.equal(grpcStatusForError({ code: 'RESOURCE_EXHAUSTED' }), 8);
assert.equal(grpcStatusForError({ code: 'DEADLINE_EXCEEDED' }), 4);
assert.equal(grpcStatusForError({ code: 14 }), 14);
console.log('gRPC error status mapping preserves retryable and conflict semantics.');