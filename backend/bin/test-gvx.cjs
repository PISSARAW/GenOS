'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const directory = path.resolve(__dirname, '../tests');
const tests = fs.readdirSync(directory).filter((file) => /^test_gvx_.*\.js$/.test(file));
tests.push('test_developmental_bridge.js');
let failures = 0;
for (const file of tests.sort()) {
  const result = spawnSync(process.execPath, [path.join(directory, file)], {
    cwd: path.resolve(__dirname, '../..'), stdio: 'inherit', windowsHide: true, timeout: 600000 });
  if (result.status !== 0) { failures += 1; console.error('FAIL '+file); }
}
console.log('GVX suite: '+tests.length+' files, '+failures+' failed.');
process.exitCode = failures ? 1 : 0;
