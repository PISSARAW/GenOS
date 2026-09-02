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
  const consecutiveFailures = triggerMetrics.consecutiveFailures || 0;
  const semanticDivergence = triggerMetrics.semanticDivergence !== undefined ? triggerMetrics.semanticDivergence : 0.8;
  const hallucinations = triggerMetrics.hallucinations || 0;
  const tokensBurned = Number(triggerMetrics.tokensBurned || 0);
  const costUsd = Number(triggerMetrics.costUsd || 0);

  // Multi-threshold criteria check
  const maxFailures = policy.maxConsecutiveFailures || 3;
  const divergenceThreshold = policy.divergenceThreshold || 0.55;
  const failureTrigger = consecutiveFailures >= maxFailures;
  const semanticTrigger = semanticDivergence < divergenceThreshold;
  const hallucinationTrigger = hallucinations >= 2;
  const maxCostUsd = Number(policy.maxCostUsd);
  const costTrigger = Number.isFinite(maxCostUsd) && maxCostUsd >= 0 && costUsd >= maxCostUsd;

  const shouldTerminate = failureTrigger || semanticTrigger || hallucinationTrigger || costTrigger;

  let primaryReason = 'No termination criteria met';
  if (failureTrigger) primaryReason = `Consecutive tool failure threshold exceeded (${consecutiveFailures} >= ${maxFailures})`;
  else if (semanticTrigger) primaryReason = `Semantic mission divergence detected (Score: ${semanticDivergence} < ${divergenceThreshold})`;
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
        `UPDATE agents SET status = 'Apoptosis', current_task = 'Terminated by Apoptosis Sentinel' WHERE id = ?`,
        [agent]
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
  const snapshotId = `cryptobiosis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const snapshot = {
    snapshotId,
    workspaceId,
    reason,
    frozenAt: new Date().toISOString(),
    state: snapshotState(statePayload)
  };
  cryptobiosisSnapshots.set(snapshotId, snapshot);
  trimSnapshots();
  return { success: true, ...snapshot, durability: 'process-memory' };
}

function thawCryptobiosis(snapshotId, targetWorkspaceId) {
  const snapshot = cryptobiosisSnapshots.get(snapshotId);
  if (!snapshot) throw new Error(`Cryptobiosis snapshot '${snapshotId}' was not found in this runtime.`);
  const agents = Array.isArray(snapshot.state.agents) ? snapshot.state.agents : [];
  return {
    success: true,
    snapshotId,
    workspaceId: targetWorkspaceId || snapshot.workspaceId,
    revivedAgentCount: agents.length,
    state: snapshotState(snapshot.state),
    durability: 'process-memory'
  };
}

function hydrateCryptobiosis(snapshot) {
  if (!snapshot?.snapshotId) throw new Error('A durable cryptobiosis snapshot is required.');
  cryptobiosisSnapshots.set(snapshot.snapshotId, snapshotState(snapshot));
  trimSnapshots();
  return snapshot;
}

module.exports = {
  calculateLevenshtein,
  trackHypermutationDrift,
  evaluateApoptosis,
  freezeCryptobiosis,
  thawCryptobiosis,
  hydrateCryptobiosis
};
