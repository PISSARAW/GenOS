/**
 * GenOS Biology & Resilience Service
 * Adaptive apoptosis policy evaluation and hypermutation drift tracking.
 */

/**
 * Calculates normalized Levenshtein distance between two strings with O(min(M, N)) space
 */
function calculateLevenshtein(strA = '', strB = '') {
  const sA = String(strA || '');
  const sB = String(strB || '');
  let m = sA.length;
  let n = sB.length;
  if (m === 0) return n === 0 ? 0 : 1.0;
  if (n === 0) return 1.0;

  // Ensure sB is the shorter string to minimize rolling buffer size
  let a = sA;
  let b = sB;
  if (m < n) {
    a = sB;
    b = sA;
    m = a.length;
    n = b.length;
  }

  // O(N) space rolling buffers
  let prevRow = new Int32Array(n + 1);
  let currRow = new Int32Array(n + 1);

  for (let j = 0; j <= n; j++) prevRow[j] = j;

  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    const charA = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = charA === b.charCodeAt(j - 1) ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,       // deletion
        currRow[j - 1] + 1,   // insertion
        prevRow[j - 1] + cost // substitution
      );
    }
    // Swap rows
    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  const rawDist = prevRow[n];
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
 * Applies controlled somatic hypermutation to an agent's working prompt
 * to break reasoning loops or test alternative exploratory paradigms.
 */
function somaticHypermutationPrompt(prompt = '', mutationRate = 0.2, options = {}) {
  const text = String(prompt || '');
  if (!text.trim()) return { originalLength: 0, mutatedLength: 0, mutatedPrompt: text, mutatedCount: 0, drift: 0 };
  const rate = Math.max(0.01, Math.min(0.8, Number(mutationRate || 0.2)));
  const seed = options.seed ? String(options.seed) : `mut_${Date.now()}`;

  const words = text.split(/(\s+)/);
  let mutatedCount = 0;

  const MUTATION_SYNONYMS = {
    'always': ['strictly', 'consistently', 'systematically'],
    'never': ['under no circumstance', 'avoid', 'prohibit'],
    'verify': ['falsify', 'cross-examine', 'validate thoroughly'],
    'analyze': ['decompose', 'dissect', 'scrutinize'],
    'execute': ['run cautiously', 'enact with verification', 'dispatch'],
    'fast': ['deliberate', 'optimized', 'budget-conscious'],
    'safe': ['adversarial-hardened', 'resilient', 'fail-safe'],
    'explore': ['broaden search', 'branch out', 'diverge']
  };

  const mutatedWords = words.map((w, idx) => {
    const clean = w.toLowerCase().replace(/[^a-z]/g, '');
    if (MUTATION_SYNONYMS[clean]) {
      let hash = 0;
      const key = `${seed}:${idx}:${clean}`;
      for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
      if ((hash / 0xffffffff) < rate) {
        const alternatives = MUTATION_SYNONYMS[clean];
        const alt = alternatives[hash % alternatives.length];
        mutatedCount++;
        return w.replace(new RegExp(clean, 'i'), alt);
      }
    }
    return w;
  });

  let result = mutatedWords.join('');
  if (mutatedCount === 0 || options.forcePerturbation) {
    const directives = [
      '\n[Somatic Hypermutation Directive: Favor exploratory alternatives and verify assumptions before committing.]',
      '\n[Somatic Hypermutation Directive: Test edge-case hypotheses and avoid repetitive tool loops.]',
      '\n[Somatic Hypermutation Directive: Re-evaluate constraints from an adversarial perspective.]'
    ];
    let dirHash = 0;
    for (let i = 0; i < seed.length; i++) dirHash = (dirHash * 31 + seed.charCodeAt(i)) >>> 0;
    result += directives[dirHash % directives.length];
    mutatedCount++;
  }

  return {
    originalLength: text.length,
    mutatedLength: result.length,
    mutatedPrompt: result,
    mutatedCount,
    drift: calculateLevenshtein(text, result)
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
  somaticHypermutationPrompt,
  evaluateApoptosis,
  freezeCryptobiosis,
  thawCryptobiosis,
  hydrateCryptobiosis,
  persistIntermediateState,
  restoreIntermediateState
};
