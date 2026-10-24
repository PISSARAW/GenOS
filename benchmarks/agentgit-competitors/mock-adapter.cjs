'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const request = JSON.parse(input);
  const evidence = { path: 'README.md', sha256: crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(__dirname, 'README.md'))).digest('hex') };
  process.stdout.write(JSON.stringify({ taskId: request.task.id, system: request.system,
    version: 'fixture-1', metrics: { integrity: { result: 'pass', evidence } } }));
});
