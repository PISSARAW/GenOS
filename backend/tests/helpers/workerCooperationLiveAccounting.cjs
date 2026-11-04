'use strict';

const store = require('../../src/services/biologicalWorkerStore');

function observedUsage(row) {
  return Boolean(row.provider_called) && row.token_usage_source === 'provider'
    && Number.isSafeInteger(row.input_tokens) && row.input_tokens >= 0
    && Number.isSafeInteger(row.output_tokens) && row.output_tokens >= 0;
}

function measuredProvider(row) { return !row.provider_called || observedUsage(row); }

function missingRegisters(receipt) {
  if (!receipt) return ['worker_receipt'];
  const missing = receipt.budgetAssessment?.missing;
  return Array.isArray(missing) ? missing : ['worker_budget_assessment'];
}

async function workerAccountingGaps(db, attempts) {
  const gaps = [];
  for (const attempt of attempts) {
    const missing = missingRegisters(await store.receipt(db, attempt.runId));
    if (missing.length) gaps.push({ runId: attempt.runId, workerId: attempt.workerId, missing });
  }
  return gaps;
}

async function accounting(db, context) {
  const rows = await db.all(`SELECT r.id,r.agent_id,r.status,r.metrics_json FROM strategy_execution_runs r
    JOIN agents a ON a.id=r.agent_id WHERE a.parent_agent_id=? ORDER BY r.rowid`, context.id);
  const attempts = rows.map(row => ({ runId: row.id, workerId: row.agent_id, status: row.status,
    metrics: JSON.parse(row.metrics_json) }));
  const workerTokens = attempts.reduce((sum, item) => sum + item.metrics.tokens, 0);
  const providerAttempts = await db.all(`SELECT id,agent_id,model,status,provider_called,input_tokens,output_tokens,
    token_usage_source,error_code FROM model_attempt_ledger
    WHERE agent_id=? OR agent_id IN (SELECT id FROM agents WHERE parent_agent_id=?) ORDER BY rowid`, context.id, context.id);
  const unmeasuredWorkerRuns = await workerAccountingGaps(db, attempts);
  const complete = providerAttempts.every(measuredProvider) && unmeasuredWorkerRuns.length === 0;
  const knownModelTokens = providerAttempts.filter(observedUsage)
    .reduce((sum, row) => sum + row.input_tokens + row.output_tokens, 0);
  return { attempts, workerTokens, providerAttempts, complete, unmeasuredWorkerRuns,
    knownModelTokens, modelTokens: complete ? knownModelTokens : null, planningTokens: context.planningTokens,
    scope: 'parent_planning_and_all_child_runs_including_failed_and_recovered_workers' };
}

module.exports = { accounting };
