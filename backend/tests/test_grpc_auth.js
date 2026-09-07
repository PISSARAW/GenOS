const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { guardHandler } = require('../src/grpc_services/grpcAuth');

const previous = process.env.GENOS_GRPC_SHARED_SECRET;
const testSecret = `test-${crypto.randomBytes(24).toString('hex')}`;
process.env.GENOS_GRPC_SHARED_SECRET = testSecret;
const calls = [];
const guarded = guardHandler((call, callback) => callback(null, { ok: true }));

guarded({ metadata: { get: () => [] } }, (error) => calls.push(error.code));
guarded({ metadata: { get: (key) => key === 'authorization' ? [`Bearer ${testSecret}`] : [] } }, (error, value) => {
  assert.equal(error, null);
  assert.deepEqual(value, { ok: true });
});
assert.deepEqual(calls, [16]);

if (previous === undefined) delete process.env.GENOS_GRPC_SHARED_SECRET;
else process.env.GENOS_GRPC_SHARED_SECRET = previous;
console.log('gRPC authentication checks passed.');
