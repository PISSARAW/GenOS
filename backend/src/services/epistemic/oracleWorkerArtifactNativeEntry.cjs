'use strict';
const { verify } = require('./oracleWorkerArtifactChecks.cjs');
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let outcome;
  try { const input = JSON.parse(raw); outcome = verify(input.subject, input.strategy); }
  catch (_) { outcome = { schema: 'genos.native-worker-artifact-oracle/v1', status: 'inconclusive', reason: 'oracle_input_invalid' }; }
  process.stdout.write(JSON.stringify({ ...outcome, processId: process.pid }));
});
