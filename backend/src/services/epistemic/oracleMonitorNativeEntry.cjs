'use strict';

const { checkMonitor } = require('./oracleMonitorChecks');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const request = JSON.parse(input);
    process.stdout.write(JSON.stringify({ ...checkMonitor(request.subject, request.strategy), processId: process.pid }));
  } catch (_) {
    process.stdout.write(JSON.stringify({ status: 'inconclusive', reason: 'monitor_oracle_input_invalid', processId: process.pid }));
  }
});
