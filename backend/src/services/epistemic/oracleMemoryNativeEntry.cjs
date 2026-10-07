'use strict';

const { checkMemory } = require('./oracleMemoryChecks');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
  if (Buffer.byteLength(input) > 131072) process.exit(2);
});
process.stdin.on('end', () => {
  try {
    const request = JSON.parse(input);
    process.stdout.write(JSON.stringify({ ...checkMemory(request.subject, request.strategy), processId: process.pid }));
  } catch { process.exitCode = 2; }
});
