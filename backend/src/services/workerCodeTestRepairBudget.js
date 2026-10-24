'use strict';

function isCodeWorker(mission) {
  return mission.localCodeWorker === true || mission.executionPolicy?.localCodeWorker === true;
}
function latencyBudget(mission) {
  const values = [mission.timeoutMs, mission.executionBudget?.latencyMs]
    .map(Number).filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.min(...values) : 30000;
}
function tokenBudget(mission) {
  const value = Number(mission.executionBudget?.tokens);
  return Number.isFinite(value) && value > 0 ? value : 0;
}
function consumedTokens(error) {
  const direct = Number(error.usage?.tokens);
  if (Number.isSafeInteger(direct) && direct >= 0) return direct;
  const input = Number(error.usage?.inputTokens);
  const output = Number(error.usage?.outputTokens);
  return Number.isSafeInteger(input) && input >= 0 && Number.isSafeInteger(output) && output >= 0
    ? input + output : null;
}

module.exports = { isCodeWorker, latencyBudget, tokenBudget, consumedTokens };
