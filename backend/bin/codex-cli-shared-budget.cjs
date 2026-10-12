'use strict';

const { encodeEvent } = require('../src/services/runtimeProtocol');

function runtimeBudget(mission) {
  try { return JSON.parse(mission.executionBudgetJson || '{}'); }
  catch (_) {
    throw Object.assign(new Error('Codex CLI mission budget is malformed.'),
      { code: 'MISSION_MODEL_BUDGET_SCOPE_INVALID' });
  }
}

async function assertSupported(mission) {
  if (!String(mission.modelBudgetScopeJson || '').trim()) return;
  const budgetRoute = require('../src/services/subprocessModelBudgetRoute');
  let route;
  try {
    route = await budgetRoute.openForMission(mission, runtimeBudget(mission));
  } finally {
    await budgetRoute.close(route);
  }
  throw Object.assign(new Error('Codex CLI does not provide a measured USD receipt '
    + 'and a pre-call reservation for this shared model budget scope.'),
  { code: 'CODEX_CLI_SHARED_BUDGET_UNSUPPORTED' });
}

function reject(error) {
  const payload = { code: error.code || 'MISSION_MODEL_BUDGET_SCOPE_INVALID' };
  process.stdout.write(encodeEvent({ eventType: 'AGENT_HALTED',
    action: 'MODEL_BUDGET_GUARD', detail: error.message,
    severity: 'warning', status: 'blocked', payload }));
  process.exitCode = 1;
}

module.exports = { assertSupported, reject };
