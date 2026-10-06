'use strict';

const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const suites = readdirSync(__dirname).filter((name) => /^test_syncytium.*\.js$/.test(name)).sort();
const failures = [];
for (const suite of suites) {
  const result = spawnSync(process.execPath, [join(__dirname, suite)], {
    stdio: 'inherit', timeout: 120000, windowsHide: true
  });
  if (result.error || result.status !== 0) {
    failures.push({ suite, status: result.status, error: result.error?.message || null });
  }
}
if (failures.length) {
  console.error('Syncytium suite failed:', JSON.stringify(failures));
  process.exitCode = 1;
} else {
  console.log('Syncytium suite: PASS (' + suites.length + ' suites, 13 variants).');
}
