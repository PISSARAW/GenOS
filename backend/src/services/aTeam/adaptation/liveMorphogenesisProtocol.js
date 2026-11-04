'use strict';

function sourceSnapshot(input, original) {
  const change = input.ctx.plan.aTeamPendingReplacement;
  const actor = id => require('../../missionProtocols/morphValues').actor(input, id);
  const tasks = change.taskRecords.map(task => ({ taskId: task.taskId, owner: actor(task.ownerAgentId),
    content: { memberId: task.memberId, contentDigest: task.contentDigest } }));
  const budgets = change.budgets.map(budget => ({ budgetId: `budget:${budget.memberId}`,
    owner: actor(budget.workerId), unit: 'tokens', limit: budget.limit,
    spent: budget.spent, reserved: budget.reserved }));
  return { ...original, tasks, budgets, evidence: [...original.evidence,
    { evidenceId: change.source.receiptId, content: change.source }] };
}

function targetPlan(input, original) {
  const change = input.ctx.plan.aTeamPendingReplacement;
  const from = require('../../missionProtocols/morphValues').actor(input, change.priorWorkerId);
  const to = require('../../missionProtocols/morphValues').actor(input, change.candidateWorkerId);
  const transfers = [];
  const snapshot = structuredClone(original.sourceSnapshot);
  for (const [kind, key] of [['tasks', 'taskId'], ['budgets', 'budgetId']]) {
    for (const item of snapshot[kind]) {
      if (item.owner.agentId !== change.priorWorkerId) continue;
      transfers.push({ kind, id: item[key], from, to });
      item.owner = to;
    }
  }
  return { ...original, targetSnapshot: { ...snapshot, topology: original.targetSnapshot.topology }, transfers };
}

module.exports = { sourceSnapshot, targetPlan };
