'use strict';

const { decodeMissionInput } = require('../../src/services/runtimeProtocol');
const budgetRoute = require('../../src/services/subprocessModelBudgetRoute');
const runner = require('../../src/services/modelRouteRunner');
const provider = require('../../src/services/modelProvider');

let raw = Buffer.alloc(0);
process.stdin.on('data', (chunk) => { raw = Buffer.concat([raw, chunk]); });
process.stdin.on('end', async () => {
  let route;
  let providerCalls = 0;
  provider.generate = async () => {
    providerCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 60));
    return { text: 'ok', inputTokens: 1, outputTokens: 1,
      tokenUsageMeasured: true };
  };
  try {
    const mission = decodeMissionInput(raw);
    const startAt = Number(process.env.GENOS_TEST_START_AT || 0);
    if (startAt > Date.now()) await new Promise((resolve) => setTimeout(resolve, startAt - Date.now()));
    route = await budgetRoute.openForMission(mission,
      JSON.parse(mission.executionBudgetJson || '{}'));
    const result = await runner.attemptRoute({ ...route, agentId: mission.agentId,
      prompt: 'x', maxTokens: 1, onToken() {}, remainingMs: () => 1000 },
    'openai://model');
    process.stdout.write(JSON.stringify({ ok: true, providerCalls,
      routeAttemptId: result.routeAttemptId }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, providerCalls,
      code: error.code, message: error.message }));
  } finally {
    await budgetRoute.close(route);
  }
});
