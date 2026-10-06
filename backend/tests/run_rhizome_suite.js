'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const files = fs.readdirSync(__dirname).filter(file => /^test_rhizome.*\.js$/.test(file)).sort();
const results = files.map(file => {
  const started = Date.now();
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { encoding: 'utf8', timeout: 60000 });
  const passed = result.status === 0;
  console.log((passed ? 'PASS ' : 'FAIL ') + file);
  if (!passed) console.error(result.stdout, result.stderr, result.error?.message || '');
  return { file, command: 'node backend/tests/' + file, exitCode: result.status, passed, durationMs: Date.now() - started };
});
const failed = results.filter(result => !result.passed).length;
console.log(files.length + ' Rhizome suites, ' + failed + ' failures');
const directory = path.join(__dirname, '../../.genos-agent-worlds/rhizome-verification');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'tests.json'), JSON.stringify({ results, failed, completedAt: new Date().toISOString() }, null, 2));
process.exitCode = failed ? 1 : 0;
