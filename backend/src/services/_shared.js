const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { appendBounded } = require('./boundedOutput');
const { terminateChild } = require('./processTermination');
const { getDatabase, withTransaction } = require('../db');
const { resolveConflictIntoState } = require('./conscienceMerge');
const { canonicalize } = require('./evaluationGraders');
const { textToVector } = require('./memoryScoring');

const { run, walk, spawnGit } = require('./sharedExecUtils');
const { traverseSynapses } = require('./synapseUtils');
const { fetchTemporalAnchors } = require('./temporalUtils');
const { compileExecutionMemory } = require('./memoryCompiler');
const { runtimeExitOutcome } = require('./executionOutcome');
const { withRetry, isRetryableJobError } = require('./retryUtils');
const { findReusableWorker, reuseAffinity, missionAffinity } = require('./workerUtils');
const { recordProvenance, persistConscienceState, persistConscienceStateNow, loadConscienceState } = require('./consciencePersistence');
const { restore, restoreUnlocked } = require('./sharedRestore');
const { decodeEmbeddingBlob } = require('./decodeEmbeddingBlob');

function estimateCostUsd(..._args) {
  const [costInput, costOutput, inputTokens, outputTokens] = _args;
  return Number(((Number(costInput || 0) * inputTokens + Number(costOutput || 0) * outputTokens) / 1_000_000).toFixed(8));
}

function policyFrom(value = {}) {
  function list(val) {
    return Array.isArray(val) ? val.map(String).map((item) => item.trim()).filter(Boolean) : [];
  }
  return {
    primary: String(value.primary || '').trim() || null,
    fallbacks: list(value.fallbacks),
    parallelReview: list(value.parallelReview),
    mode: value.mode === 'parallel' ? 'parallel' : 'fallback',
    preferLocal: value.preferLocal === true
  };
}

async function loadPolicy(db, { agentId, organizationId, projectId }) {
  if (!db || !agentId) return null;
  const scoped = organizationId && projectId;
  const query = scoped
    ? `SELECT policy_json FROM agent_model_routing_policies
       WHERE (agent_id = ? OR agent_id = '*') AND organization_id = ? AND project_id = ?
       ORDER BY CASE WHEN agent_id = ? THEN 0 ELSE 1 END LIMIT 1`
    : `SELECT policy_json FROM agent_model_routing_policies
       WHERE agent_id = ? OR agent_id = '*' ORDER BY CASE WHEN agent_id = ? THEN 0 ELSE 1 END LIMIT 1`;
  const params = scoped ? [agentId, organizationId, projectId, agentId] : [agentId, agentId];
  const row = await db.get(query, ...params);
  if (!row) return null;
  try { return policyFrom(JSON.parse(row.policy_json || '{}')); } catch (_) { return null; }
}

module.exports = {
  run, walk, spawnGit, restore, restoreUnlocked, compileExecutionMemory,
  runtimeExitOutcome, estimateCostUsd, loadPolicy, policyFrom,
  traverseSynapses, fetchTemporalAnchors, decodeEmbeddingBlob,
  withRetry, isRetryableJobError, findReusableWorker, reuseAffinity, missionAffinity,
  recordProvenance, persistConscienceState, persistConscienceStateNow, loadConscienceState
};