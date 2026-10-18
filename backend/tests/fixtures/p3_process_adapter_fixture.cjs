'use strict';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const request = JSON.parse(input);
  const external = ['langgraph-static', 'autogen-graphflow-swarm', 'mass-evomas']
    .includes(request.conditionId);
  const forbidden = ['split', 'datasetId', 'oracleId', 'taskId']
    .some(field => Object.prototype.hasOwnProperty.call(request, field));
  const receipt = { schema: 'genos.morphogenesis.p3-adapter-receipt/v1',
    attemptId: request.attemptId, inputHash: request.inputHash,
    idempotencyKey: request.attemptId, framework: process.env.P3_FIXTURE_FRAMEWORK,
    adapterVersion: process.env.P3_FIXTURE_VERSION,
    executionKind: external ? 'native-framework' : 'native-runtime',
    candidate: { solved: true, seed: request.seed, forbiddenContextObserved: forbidden },
    metrics: { tokens: 10, latencyMs: 1, cost: request.conditionId === 'genos-adaptive' ? 0.02 : 0.01 } };
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
});
