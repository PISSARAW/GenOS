'use strict';

const assert = require('node:assert/strict');
const { genosEnvironment } = require('../src/services/genosCliEnv');
const names = ['GENOS_TEST_TOKEN', 'GENOS_TEST_SECRET', 'GENOS_TEST_PASSWORD',
  'GENOS_TEST_KEY', 'GENOS_TEST_CREDENTIAL', 'GENOS_API_URL', 'GENOS_DB_PATH', 'UNRELATED_PRIVATE_VALUE'];
const saved = new Map(names.map(name => [name, process.env[name]]));
try {
  for (const name of names) process.env[name] = 'environment-filter-test-only';
  const child = genosEnvironment('test-bridge-root');
  for (const name of names.filter(name => name !== 'GENOS_DB_PATH')) {
    assert.equal(Object.hasOwn(child, name), false, name);
  }
  assert.equal(child.GENOS_DB_PATH, 'environment-filter-test-only');
  assert.equal(child.GENOS_STUDIO_ROOT, 'test-bridge-root');
  assert.equal(child.GENOS_ROOT, 'test-bridge-root');
} finally {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
console.log('Real CLI environment filters credentials and preserves safe configuration: PASS');
