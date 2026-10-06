'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const files = fs.readdirSync(__dirname).filter((name) => /^test_biocenose_.*\.js$/.test(name)).sort();
let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 600000
  });
  process.stdout.write(`${file}: ${result.status === 0 ? 'PASS' : 'FAIL'}\n`);
  if (result.status !== 0) {
    failed += 1;
    process.stderr.write(`${result.stdout || ''}${result.stderr || ''}${result.error || ''}\n`);
  }
}
console.log(`Biocenose: ${files.length - failed}/${files.length} test files passed.`);
process.exitCode = failed ? 1 : 0;
