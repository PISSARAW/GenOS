'use strict';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
  if (Buffer.byteLength(input) > 131072) process.exit(2);
});
process.stdin.on('end', () => {
  try {
    const request = JSON.parse(input);
    const outcome = require('./oracleWorkspaceChecks').checkWorkspace(request.subject, request.strategy);
    process.stdout.write(JSON.stringify({ ...outcome, processId: process.pid }));
  } catch (_) { process.exitCode = 2; }
});
