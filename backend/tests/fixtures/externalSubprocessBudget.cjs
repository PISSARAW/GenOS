'use strict';

const { decodeMissionInput } = require('../../src/services/runtimeProtocol');
const budget = require('../../src/services/externalSubprocessModelBudget');

let raw = Buffer.alloc(0);
process.stdin.on('data', (chunk) => { raw = Buffer.concat([raw, chunk]); });
process.stdin.on('end', async () => {
  let route;
  let providerCalls = 0;
  try {
    const mission = decodeMissionInput(raw);
    const startAt = Number(process.env.GENOS_TEST_START_AT || 0);
    if (startAt > Date.now()) await new Promise((resolve) => setTimeout(resolve, startAt - Date.now()));
    const state = { mission, executionBudget: JSON.parse(mission.executionBudgetJson || '{}') };
    route = state.modelBudgetRoute = await budget.openForState(state);
    const result = await budget.sample(state,
      { messages: [{ role: 'user', content: 'x' }], max_tokens: 4 },
      async (request) => {
        providerCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 80));
        return { usage: process.env.GENOS_TEST_USAGE === 'missing' ? {} : {
          prompt_tokens: 1, completion_tokens: 1, cost_usd: 0.6 },
        maxTokens: request.max_tokens };
      });
    process.stdout.write(JSON.stringify({ ok: true, providerCalls,
      maxTokens: result.maxTokens, usage: state.sharedModelUsage }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, providerCalls,
      code: error.code, message: error.message }));
  } finally {
    await budget.close(route);
  }
});
