'use strict';

// Trusted pure worker: no user code evaluation, shell, filesystem or MCP tools.
const { executeProgram } = require('../src/services/nceProcedureProgram');
let source = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  source += chunk;
  if (source.length > 131072) process.exit(2);
});
process.stdin.on('end', () => {
  try {
    const request = JSON.parse(source);
    process.stdout.write(JSON.stringify(executeProgram(request.program, request.input)));
  } catch (error) {
    process.stderr.write(error.message);
    process.exitCode = 1;
  }
});
