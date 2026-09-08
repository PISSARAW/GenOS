const assert = require('assert');
const { readPort, readGracePeriod } = require('../src/services/runtimeConfig');

assert.equal(readPort('PORT', undefined, 4000), 4000);
assert.equal(readPort('PORT', '8080', 4000), 8080);
assert.throws(() => readPort('PORT', '0', 4000), /PORT must be an integer/);
assert.throws(() => readPort('GRPC_PORT', 'invalid', 50051), /GRPC_PORT must be an integer/);
assert.throws(() => readPort('PORT', '65536', 4000), /PORT must be an integer/);
assert.equal(readGracePeriod('30000'), 30000);
assert.throws(() => readGracePeriod('30001'), /GENOS_PROCESS_GRACE_MS must be an integer/);

console.log('runtime configuration validation checks passed.');