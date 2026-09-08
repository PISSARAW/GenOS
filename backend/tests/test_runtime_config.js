const assert = require('assert');
const { readPort, readGracePeriod, readSqliteMmapSize, readSqliteSynchronous } = require('../src/services/runtimeConfig');

assert.equal(readPort('PORT', undefined, 4000), 4000);
assert.equal(readPort('PORT', '8080', 4000), 8080);
assert.throws(() => readPort('PORT', '0', 4000), /PORT must be an integer/);
assert.throws(() => readPort('GRPC_PORT', 'invalid', 50051), /GRPC_PORT must be an integer/);
assert.throws(() => readPort('PORT', '65536', 4000), /PORT must be an integer/);
assert.equal(readGracePeriod('30000'), 30000);
assert.throws(() => readGracePeriod('30001'), /GENOS_PROCESS_GRACE_MS must be an integer/);
assert.equal(readSqliteMmapSize(undefined), 268435456);
assert.throws(() => readSqliteMmapSize('1073741825'), /GENOS_SQLITE_MMAP_SIZE must be an integer/);
assert.equal(readSqliteSynchronous(undefined), 'FULL');
assert.equal(readSqliteSynchronous('normal'), 'NORMAL');
assert.throws(() => readSqliteSynchronous('OFF'), /GENOS_SQLITE_SYNCHRONOUS/);

console.log('runtime configuration validation checks passed.');