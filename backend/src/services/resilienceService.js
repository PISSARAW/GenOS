/**
 * GenOS Biology & Resilience Service
 * Adaptive apoptosis policy evaluation and hypermutation drift tracking.
 */

/**
 * Calculates normalized Levenshtein distance between two strings
 */
function calculateLevenshtein(strA = '', strB = '') {
  const m = strA.length;
  const n = strB.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = strA[i - 1] === strB[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  const rawDist = dp[m][n];
  const maxLen = Math.max(m, n);
  return Number((rawDist / maxLen).toFixed(4));
}

/**
 * Tracks prompt hypermutation drift against ancestral baseline
 */
function trackHypermutationDrift(ancestorPrompt, currentPrompt) {
  const driftScore = calculateLevenshtein(ancestorPrompt || '', currentPrompt || '');
  const safetyHorizonLimit = 0.35;
  const isSafe = driftScore <= safetyHorizonLimit;

  return {
    ancestorLength: ancestorPrompt ? ancestorPrompt.length : 0,
    currentLength: currentPrompt ? currentPrompt.length : 0,
    driftScore,
    safetyHorizonLimit,
    isSafe,
    status: isSafe ? 'STABLE' : 'MUTATION_DRIFT_EXCEEDED',
    actionRequired: isSafe ? 'NONE' : 'ROLLBACK_GENOME_MUTATION'
  };
}

/**
 * Evaluates adaptive apoptosis criteria and generates post-mortem autopsy report
 */
async function evaluateApoptosis(agentId, triggerMetrics = {}, db = null, policy = {}) {
  const agent = agentId || 'agent-unknown';
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const consecutiveFailures = Math.max(0, Math.floor(finite(triggerMetrics.consecutiveFailures, 0)));
  const semanticDivergence = Math.max(0, Math.min(1, finite(triggerMetrics.semanticDivergence, 0.8)));
  const hallucinations = Math.max(0, Math.floor(finite(triggerMetrics.hallucinations, 0)));
  const tokensBurned = Math.max(0, finite(triggerMetrics.tokensBurned, 0));
  const costUsd = Math.max(0, finite(triggerMetrics.costUsd, 0));

  // Multi-threshold criteria check
  const maxFailures = Math.max(0, Math.floor(finite(policy.maxConsecutiveFailures, 3)));
  const divergenceThreshold = Math.max(0, Math.min(1, finite(policy.divergenceThreshold, 0.55)));
  const failureTrigger = consecutiveFailures >= maxFailures;
  const semanticTrigger = semanticDivergence > divergenceThreshold;
  const hallucinationTrigger = hallucinations >= 2;
  const maxCostUsd = Number(policy.maxCostUsd);
  const costTrigger = Number.isFinite(maxCostUsd) && maxCostUsd >= 0 && costUsd >= maxCostUsd;

  const shouldTerminate = failureTrigger || semanticTrigger || hallucinationTrigger || costTrigger;

  let primaryReason = 'No termination criteria met';
  if (failureTrigger) primaryReason = `Consecutive tool failure threshold exceeded (${consecutiveFailures} >= ${maxFailures})`;
  else if (semanticTrigger) primaryReason = `Semantic mission divergence detected (Score: ${semanticDivergence} > ${divergenceThreshold})`;
  else if (hallucinationTrigger) primaryReason = `Unverified hallucination limit breached (${hallucinations} >= 2)`;
  else if (costTrigger) primaryReason = `Execution cost limit breached (${costUsd} >= ${maxCostUsd} USD)`;

  // Build the report from persisted agent telemetry. Do not invent call stacks
  // or failed tool calls when the evaluation found no termination condition.
  let lastActions = [];
  if (db) {
    const events = await db.all(
      'SELECT event_type, action, detail, severity, created_at FROM telemetry_events WHERE agent_id = ? ORDER BY id DESC LIMIT 3',
      agent
    );
    lastActions = events.reverse().map((event, index) => ({
      step: index + 1,
      tool: event.action || event.event_type,
      status: String(event.severity || 'info').toUpperCase(),
      detail: event.detail || ''
    }));
  }

  // Generate an evidence-bounded autopsy report.
  const autopsyReport = {
    reportId: `autopsy_${agent}_${Date.now()}`,
    agentId: agent,
    timestamp: new Date().toISOString(),
    apoptosisExecuted: shouldTerminate,
    triggerReason: primaryReason,
    metricsSnapshot: {
      consecutiveFailures,
      tokensBurned,
      costUsd,
      semanticDivergence,
      hallucinations
    },
    terminalCallStack: shouldTerminate ? ['Termination requested by resilience policy.'] : [],
    lastActions,
    failingInvariant: shouldTerminate ? primaryReason : null,
    recommendedPromptPatch: shouldTerminate ? 'Review the recorded telemetry and adjust the mission guardrails before restarting.' : null
  };

  // If DB available and apoptosis executed, update agent status
  if (db && shouldTerminate) {
    try {
      await db.run(
        `UPDATE agents SET status = 'apoptosis', is_apoptotic = 1, current_task = 'Terminated by Apoptosis Sentinel', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        agent
      );
    } catch (e) {
      // Ignore if agent row doesn't exist
    }
  }

  return autopsyReport;
}

const cryptobiosisSnapshots = new Map();
const MAX_CRYPTOBIOSIS_SNAPSHOTS = 1024;

function snapshotState(statePayload) {
  return JSON.parse(JSON.stringify(statePayload || {}));
}

function trimSnapshots() {
  while (cryptobiosisSnapshots.size > MAX_CRYPTOBIOSIS_SNAPSHOTS) {
    cryptobiosisSnapshots.delete(cryptobiosisSnapshots.keys().next().value);
  }
}

function freezeCryptobiosis(workspaceId = 'fleet', reason = '', statePayload = {}) {
  const snapshotId = `cryptobiosis_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const frozenAt = new Date().toISOString();
  const snapshot = {
    snapshotId,
    workspaceId,
    reason,
    frozenAt,
    state: snapshotState(statePayload)
  };
  cryptobiosisSnapshots.set(snapshotId, snapshot);
  trimSnapshots();
  return snapshot;
}

function thawCryptobiosis(snapshotId, targetWorkspaceId) {
  const snapshot = cryptobiosisSnapshots.get(snapshotId);
  if (!snapshot) {
    return {
      success: false,
      code: 'SNAPSHOT_NOT_FOUND',
      error: `Cryptobiosis snapshot '${snapshotId}' is not found.`,
      snapshotId,
      workspaceId: targetWorkspaceId || null
    };
  }
  return {
    success: true,
    snapshotId,
    workspaceId: targetWorkspaceId || snapshot.workspaceId,
    state: snapshotState(snapshot.state),
    restoredAt: new Date().toISOString()
  };
}

function hydrateCryptobiosis(snapshot) {
  if (!snapshot?.snapshotId) throw new Error('A durable cryptobiosis snapshot is required.');
  cryptobiosisSnapshots.set(snapshot.snapshotId, snapshotState(snapshot));
  trimSnapshots();
  return snapshot;
}

async function persistIntermediateState(db, agentId, statePayload = {}, reason = 'runtime checkpoint') {
  if (!db || typeof db.run !== 'function') {
    throw new Error('A database handle is required to persist intermediate runtime state.');
  }
  if (!agentId) {
    throw new Error('agentId is required to persist intermediate runtime state.');
  }
  const state = snapshotState(statePayload || {});
  const workspaceId = state.workspaceId || state.workspace_id || null;
  const status = state.status || 'intermediate';
  const currentTask = state.currentTask || state.current_task || null;
  const snapshotId = `runtime_state_${String(agentId).replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.run(
    `INSERT INTO agent_runtime_state (id, agent_id, workspace_id, status, current_task, reason, state_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(agent_id) DO UPDATE SET
       workspace_id = excluded.workspace_id,
       status = excluded.status,
       current_task = excluded.current_task,
       reason = excluded.reason,
       state_json = excluded.state_json,
       updated_at = CURRENT_TIMESTAMP`,
    snapshotId,
    agentId,
    workspaceId,
    status,
    currentTask,
    reason,
    JSON.stringify(state)
  );
  return snapshotId;
}

async function restoreIntermediateState(db, agentId) {
  if (!db || typeof db.get !== 'function') {
    throw new Error('A database handle is required to restore intermediate runtime state.');
  }
  if (!agentId) {
    throw new Error('agentId is required to restore intermediate runtime state.');
  }
  const row = await db.get('SELECT * FROM agent_runtime_state WHERE agent_id = ?', agentId);
  if (!row) return null;
  try {
    return {
      id: row.id,
      agentId: row.agent_id,
      workspaceId: row.workspace_id,
      status: row.status,
      currentTask: row.current_task,
      reason: row.reason,
      ...JSON.parse(row.state_json || '{}'),
      updatedAt: row.updated_at
    };
  } catch (error) {
    throw new Error(`Unable to restore intermediate state for agent ${agentId}: ${error.message}`);
  }
}

module.exports = {
  calculateLevenshtein,
  trackHypermutationDrift,
  evaluateApoptosis,
  freezeCryptobiosis,
  thawCryptobiosis,
  hydrateCryptobiosis,
  persistIntermediateState,
  restoreIntermediateState
};
