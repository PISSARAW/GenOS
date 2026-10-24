'use strict';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const request = JSON.parse(input);
  process.stdout.write(JSON.stringify({ taskId: request.task.id, system: request.system,
    version: 'fixture-1', metrics: { integrity: { result: 'pass', evidence: 'fixture-only' } } }));
});
