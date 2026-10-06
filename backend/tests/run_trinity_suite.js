'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const tests = fs.readdirSync(__dirname).filter(name => /^test_trinity_.*\.js$/.test(name)).sort();
const failures = [];
for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], {
    encoding: 'utf8', timeout: 90000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, GENOS_ADMIN_PASSWORD: process.env.GENOS_ADMIN_PASSWORD || 'trinity-suite-only' }
  });
  const passed = result.status === 0;
  console.log(`${passed ? 'PASS' : 'FAIL'} ${test}`);
  if (!passed) {
    failures.push(test);
    console.error((result.error?.message || '') + '\n' + result.stderr + '\n' + result.stdout.slice(-6000));
  }
}
console.log(`Trinity suite: ${tests.length - failures.length}/${tests.length} passed.`);
process.exitCode = failures.length ? 1 : 0;
