'use strict';

const crypto = require('node:crypto');
const execution = require('./strategyExecutionService');

function sameRoute(row, input) {
  return row?.id === input.result?.routeAttemptId
    && row.mission_id === input.request.executionRunId
    && row.action_id === input.action.id
    && row.agent_id === input.request.agentId
    && row.organization_id === input.binding.scope.organizationId
    && row.project_id === input.binding.scope.projectId;
}

function measuredUsage(row) {
  return row?.status === 'completed' && row.provider_called === 1
    && row.token_usage_source === 'provider'
    && Number.isSafeInteger(row.input_tokens) && row.input_tokens >= 0
    && Number.isSafeInteger(row.output_tokens) && row.output_tokens >= 0
    && Number.isFinite(row.cost_usd) && row.cost_usd >= 0;
}

function outputDigest(result) {
  if (typeof result?.text !== 'string') return null;
  return `sha256:${crypto.createHash('sha256').update(result.text, 'utf8').digest('hex')}`;
}

function usageEvent(input, row) {
  return { id: `mission-model-usage:${row.id}`, eventType: 'MODEL_USAGE_OBSERVED',
    action: 'MODEL_CALL', detail: 'Measured provider usage for the selected mission action.',
    payload: { executionRunId: input.request.executionRunId,
      routeAttemptId: row.id, actionId: input.action.id, usageSource: 'provider',
      outputDigest: outputDigest(input.result), outputEncoding: 'utf8-raw-text',
      usage: { input_tokens: row.input_tokens, output_tokens: row.output_tokens,
        cost_usd: row.cost_usd } } };
}

async function observe(db, input) {
  if (!['small_model', 'large_model'].includes(input.action.kind)
      || !input.result?.routeAttemptId) return { recorded: false };
  const row = await db.get('SELECT * FROM model_attempt_ledger WHERE id = ?',
    input.result.routeAttemptId);
  if (!sameRoute(row, input) || !measuredUsage(row)) return { recorded: false };
  const saved = await execution.recordExecutionEvent(db, input.request.agentId,
    usageEvent(input, row));
  if (!saved || saved.halt || saved.authorityRefusal) {
    throw Object.assign(new Error('Measured model usage was refused by the mission run.'),
      { code: 'MISSION_MODEL_USAGE_NOT_RECORDED' });
  }
  return { recorded: true, routeAttemptId: row.id };
}

async function reportEvidence(db, input) {
  if (input.action.execution?.oracleDomain !== 'model_subset_sum') return { recorded: false };
  if (!input.observation?.recorded || typeof input.result?.text !== 'string'
      || Buffer.byteLength(input.result.text, 'utf8') > 16384) {
    throw Object.assign(new Error('Model oracle requires measured bounded raw output.'),
      { code: 'MISSION_MODEL_ORACLE_OUTPUT_REQUIRED' });
  }
  const modelOutput = { schema: 'genos.model-oracle-output/v1',
    encoding: 'utf8-raw-text', runId: input.request.executionRunId,
    actionId: input.action.id, routeAttemptId: input.observation.routeAttemptId,
    digest: outputDigest(input.result), text: input.result.text };
  const event = { id: `model-subset-evidence:${input.observation.routeAttemptId}`,
    eventType: 'EVIDENCE_REPORT', timestamp: new Date().toISOString(),
    payload: { executionRunId: input.request.executionRunId,
      evidenceReport: { outcome: 'success', workerArtifact: {
        type: 'model_subset_sum', content: { modelOutput } },
      claims: [{ statement: 'Model subset sum candidate recorded for independent verification.',
        evidence: [input.observation.routeAttemptId] }] } } };
  const saved = await execution.recordExecutionEvent(db, input.request.agentId, event);
  if (!saved || saved.halt || saved.authorityRefusal) {
    throw Object.assign(new Error('Model oracle evidence report was refused.'),
      { code: 'MISSION_MODEL_ORACLE_EVIDENCE_REFUSED' });
  }
  return { recorded: true, modelOutput };
}

module.exports = { observe, reportEvidence };
