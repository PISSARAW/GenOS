const assert = require('node:assert/strict');
const grpc = require('@grpc/grpc-js');
const { grpcStatusForError } = require('../src/services/grpcErrorMapper');

assert.equal(grpcStatusForError({ code: 'INVALID_ARGUMENT' }), grpc.status.INVALID_ARGUMENT);
assert.equal(grpcStatusForError({ code: 'NOT_FOUND' }), grpc.status.NOT_FOUND);
assert.equal(grpcStatusForError({ code: 'UNAUTHENTICATED' }), grpc.status.UNAUTHENTICATED);
assert.equal(grpcStatusForError({ code: 'PERMISSION_DENIED' }), grpc.status.PERMISSION_DENIED);
assert.equal(grpcStatusForError({ code: 'UNAVAILABLE' }), grpc.status.UNAVAILABLE);
console.log('gRPC error mapping is consistent across service families.');