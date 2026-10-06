'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const tests = fs.readdirSync(__dirname).filter(name => /^test_.*(morphogenesis|morphogenetic|morphology).*\.js$/.test(name));
tests.push('morphogenesis/test_learning_services.js');
const failures = [];
for (const name of tests.sort()) {
  const result = spawnSync(process.execPath, [path.join(__dirname, name)], { encoding: 'utf8', timeout: 120000, env: { ...process.env, GENOS_ADMIN_PASSWORD: process.env.GENOS_ADMIN_PASSWORD || 'morphogenesis-suite-only' } });
  if (result.status !== 0) {
    failures.push(name); console.error('FAIL', name, result.error?.message || '', result.stdout, result.stderr);
  } else console.log('PASS', name);
}
console.log('Morphogenesis suite:', tests.length - failures.length, '/', tests.length, 'passed');
if (failures.length) process.exitCode = 1;
