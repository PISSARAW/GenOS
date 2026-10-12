'use strict';
const { checkCredit } = require('./oracleExternalCreditChecks.cjs');
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let result;
  try {
    const input = JSON.parse(raw);
    result = checkCredit(input.subject, input.strategy);
  } catch (_) { result = { schema: 'genos.external-credit-oracle/v1', status: 'inconclusive', reason: 'oracle_input_invalid' }; }
  process.stdout.write(JSON.stringify({ ...result, processId: process.pid }));
});
