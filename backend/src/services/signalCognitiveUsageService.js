'use strict';

const USAGE_QUERY = `SELECT
  SUM(CASE WHEN provider_called = 1 THEN 1 ELSE 0 END) AS provider_calls,
  SUM(CASE WHEN provider_called = 1 AND token_usage_source != 'provider' THEN 1 ELSE 0 END) AS unmeasured_calls,
  SUM(CASE WHEN provider_called = 1 AND cost_usd IS NULL THEN 1 ELSE 0 END) AS unknown_cost_calls,
  COALESCE(SUM(CASE WHEN provider_called = 1 THEN input_tokens ELSE 0 END), 0) AS input_tokens,
  COALESCE(SUM(CASE WHEN provider_called = 1 THEN output_tokens ELSE 0 END), 0) AS output_tokens,
  COALESCE(SUM(CASE WHEN provider_called = 1 THEN cost_usd ELSE 0 END), 0) AS cost_usd
  FROM model_attempt_ledger WHERE action_id = ? AND agent_id = ?`;

function actionId(signalId) {
  return `signal:${signalId}`;
}

function unavailable(reason) {
  return { source: 'model_attempt_ledger', tokenCoverage: 'unavailable',
    costCoverage: 'unavailable', inputTokens: null, outputTokens: null,
    costUsd: null, providerCalls: 0, reason };
}

function coverageOf(row) {
  const unmeasuredCalls = Number(row.unmeasured_calls || 0);
  const unknownCostCalls = Number(row.unknown_cost_calls || 0);
  return { tokenComplete: unmeasuredCalls === 0,
    costComplete: unmeasuredCalls + unknownCostCalls === 0 };
}

function summarize(row) {
  const providerCalls = Number(row?.provider_calls || 0);
  if (!providerCalls) return unavailable('no_provider_call');
  const { tokenComplete, costComplete } = coverageOf(row);
  return { source: 'model_attempt_ledger', providerCalls,
    tokenCoverage: tokenComplete ? 'complete' : 'incomplete',
    costCoverage: costComplete ? 'complete' : 'incomplete',
    inputTokens: tokenComplete ? Number(row.input_tokens) : null,
    outputTokens: tokenComplete ? Number(row.output_tokens) : null,
    costUsd: costComplete ? Number(row.cost_usd) : null };
}

async function measure(db, signalId, agentId) {
  if (!db || !signalId || !agentId) return unavailable('scope_missing');
  let row;
  try {
    row = await db.get(USAGE_QUERY, actionId(signalId), agentId);
  } catch (error) {
    return unavailable(error.message);
  }
  return summarize(row);
}

module.exports = { actionId, measure };
