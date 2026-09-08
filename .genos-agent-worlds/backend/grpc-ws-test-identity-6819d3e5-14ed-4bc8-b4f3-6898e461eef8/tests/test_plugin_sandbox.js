const assert = require('assert');
const { validateImage, validate } = require('../src/services/pluginSandbox');

assert.strictEqual(validateImage('registry.example/plugin:v1@sha256:' + 'a'.repeat(64)), 'registry.example/plugin:v1@sha256:' + 'a'.repeat(64));
assert.throws(() => validateImage('registry.example/plugin:latest'), /sha256 digest/);
const previous = process.env.GENOS_PLUGIN_REGISTRIES;
process.env.GENOS_PLUGIN_REGISTRIES = 'registry.example';
try {
  assert.throws(() => validateImage('attacker.example/plugin:v1@sha256:' + 'a'.repeat(64)), /not allowed/);
  assert.doesNotThrow(() => validate({ id: 'safe-plugin', image: 'registry.example/plugin:v1@sha256:' + 'b'.repeat(64), capabilities: [] }));
} finally {
  if (previous === undefined) delete process.env.GENOS_PLUGIN_REGISTRIES;
  else process.env.GENOS_PLUGIN_REGISTRIES = previous;
}
console.log('Plugin sandbox image policy checks passed.');