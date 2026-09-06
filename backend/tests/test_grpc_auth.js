const assert = require('node:assert/strict');
const { guardHandler } = require('../src/grpc_services/grpcAuth');

const previous = process.env.GENOS_GRPC_SHARED_SECRET;
process.env.GENOS_GRPC_SHARED_SECRET = 'test-secret';
const calls = [];
const guarded = guardHandler((call, callback) => callback(null, { ok: true }));

guarded({ metadata: { get: () => [] } }, (error) => calls.push(error.code));
guarded({ metadata: { get: (key) => key === 'authorization' ? ['Bearer test-secret'] : [] } }, (error, value) => {
  assert.equal(error, null);
  assert.deepEqual(value, { ok: true });
});
assert.deepEqual(calls, [16]);

if (previous === undefined) delete process.env.GENOS_GRPC_SHARED_SECRET;
else process.env.GENOS_GRPC_SHARED_SECRET = previous;
console.log('gRPC authentication checks passed.');
