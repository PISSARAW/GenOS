const assert = require('assert');
const { dockerRunArgs } = require('../src/services/pluginSandbox');

const args = dockerRunArgs({ image: 'example/plugin@sha256:' + 'a'.repeat(64) });
assert.ok(args.includes('--cpus'));
assert.ok(args.includes('--memory-swap'));
assert.ok(args.some((value) => value.startsWith('/tmp:rw')));
assert.ok(args.includes('--ulimit'));
console.log('Plugin sandbox resource limits passed.');