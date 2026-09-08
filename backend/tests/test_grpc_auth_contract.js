const assert = require('node:assert/strict');
const { guardHandler } = require('../src/grpc_services/grpcAuth');

const previous = process.env.GENOS_GRPC_SHARED_SECRET;
process.env.GENOS_GRPC_SHARED_SECRET = 'expected-secret';
const guarded = guardHandler((_call, callback) => callback(null, { ok: true }));

function invoke(metadata) {
  return new Promise((resolve) => guarded({ metadata: { get: (key) => metadata[key] || [] } }, (error, value) => resolve({ error, value })));
}

(async () => {
  const missing = await invoke({});
  assert.equal(missing.error.code, 16);
  const rejected = await invoke({ 'x-genos-grpc-key': ['wrong-secret'] });
  assert.equal(rejected.error.code, 7);
  const accepted = await invoke({ 'x-genos-grpc-key': ['expected-secret'] });
  assert.deepEqual(accepted.value, { ok: true });
  if (previous === undefined) delete process.env.GENOS_GRPC_SHARED_SECRET;
  else process.env.GENOS_GRPC_SHARED_SECRET = previous;
  console.log('gRPC auth distinguishes unauthenticated and denied credentials.');
})().catch((error) => { if (previous === undefined) delete process.env.GENOS_GRPC_SHARED_SECRET; else process.env.GENOS_GRPC_SHARED_SECRET = previous; console.error(error); process.exitCode = 1; });