'use strict';

const { selectedBudget } = require('../../../bin/workerLaunchPayload.cjs');

function allocate(composition, request) {
  const parent = request.execution_budget || request.executionBudget;
  if (!parent) return composition;
  const members = composition.members.filter(member => member.executionMode !== 'orchestrator');
  if (!members.length) return composition;
  const budget = { ...parent, tokens: Math.floor(parent.tokens / members.length),
    costUsd: parent.costUsd / members.length };
  if (!Number.isSafeInteger(budget.tokens) || budget.tokens < 1
      || !Number.isFinite(budget.costUsd) || budget.costUsd <= 0) {
    throw Object.assign(new Error('Biome requires a positive bounded allocation for every required worker.'),
      { code: 'BIOME_DISPATCH_BUDGET_INSUFFICIENT' });
  }
  return { ...composition, members: composition.members.map(member =>
    member.executionMode === 'orchestrator' ? member : { ...member,
      executionBudget: selectedBudget({ executionBudget: budget }, request) }) };
}

module.exports = { allocate };
