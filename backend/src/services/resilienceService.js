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
        const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return w.replace(new RegExp(escaped, 'i'), alt);
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
  let actualAgentId = agentId;
  let actualMetrics = triggerMetrics;
  let actualDb = db;
  let actualPolicy = policy;

  if (agentId && typeof agentId === 'object' && !Array.isArray(agentId)) {
    actualAgentId = agentId.agentId || agentId.agent_id || 'agent-unknown';
    actualMetrics = agentId.triggerMetrics || agentId.metrics || {};
    actualDb = agentId.db || null;
    actualPolicy = agentId.policy || {};
  }

  const agent = actualAgentId || 'agent-unknown';
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const consecutiveFailures = Math.max(0, Math.floor(finite(actualMetrics.consecutiveFailures, 0)));
  const hasExplicitDivergence = actualMetrics.semanticDivergence !== undefined && actualMetrics.semanticDivergence !== null;
  const rawDivergence = hasExplicitDivergence ? Number(actualMetrics.semanticDivergence) : null;
  const semanticDivergence = rawDivergence !== null ? Math.max(0, Math.min(1, rawDivergence)) : 0.0;
  const hallucinations = Math.max(0, Math.floor(finite(actualMetrics.hallucinations, 0)));
  const tokensBurned = Math.max(0, finite(actualMetrics.tokensBurned, 0));
  const costUsd = Math.max(0, finite(actualMetrics.costUsd, 0));

  // Multi-threshold criteria check
  const maxFailures = Math.max(0, Math.floor(finite(actualPolicy.maxConsecutiveFailures, 3)));
  const divergenceThreshold = Math.max(0, Math.min(1, finite(actualPolicy.divergenceThreshold, 0.55)));
  const failureTrigger = consecutiveFailures >= maxFailures;
  const semanticTrigger = hasExplicitDivergence && rawDivergence > 0 && (rawDivergence < divergenceThreshold || rawDivergence > 0.85);
  const hallucinationTrigger = hallucinations >= 2;
  const maxCostUsd = Number(actualPolicy.maxCostUsd);
  const costTrigger = Number.isFinite(maxCostUsd) && maxCostUsd >= 0 && costUsd >= maxCostUsd;

  // Modèle biophysique de Conscience cognitive synchronisé avec Rust ConscienceState
  const errorsPenalty = consecutiveFailures * 2.5;
  const repetitionPenalty = (finite(actualMetrics.repetitionScore, 0) > 0.15 || hallucinations >= 1) ? 5.0 : 0.0;
  const driftPenalty = (semanticDivergence > 0.35) ? 6.0 : 0.0;
  const penalty = errorsPenalty + repetitionPenalty + driftPenalty;
  const relief = finite(actualMetrics.progressScore, 0) * 3.0;
  const initialDissonance = finite(actualMetrics.dissonanceLevel, 0.0);
  const dissonanceLevel = Math.max(0, Number((initialDissonance + penalty - relief).toFixed(4)));
  const maxDissonanceThreshold = finite(actualPolicy.maxDissonanceThreshold, 50.0);
  const dissonanceTrigger = dissonanceLevel >= maxDissonanceThreshold;

  const shouldTerminate = failureTrigger || semanticTrigger || hallucinationTrigger || costTrigger || dissonanceTrigger;

  let primaryReason = 'No termination criteria met';
  if (dissonanceTrigger) primaryReason = `Cognitive conscience dissonance threshold exceeded (${dissonanceLevel} >= ${maxDissonanceThreshold})`;
  else if (failureTrigger) primaryReason = `Consecutive tool failure threshold exceeded (${consecutiveFailures} >= ${maxFailures})`;
  else if (semanticTrigger) primaryReason = `Semantic mission divergence detected (Score: ${semanticDivergence} < ${divergenceThreshold})`;
  else if (hallucinationTrigger) primaryReason = `Unverified hallucination limit breached (${hallucinations} >= 2)`;
  else if (costTrigger) primaryReason = `Execution cost limit breached (${costUsd} >= ${maxCostUsd} USD)`;

  // Build the report from persisted agent telemetry. Do not invent call stacks
  // or failed tool calls when the evaluation found no termination condition.
  let lastActions = [];
  if (actualDb) {
    const events = await actualDb.all(
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
      dissonanceLevel,
      maxDissonanceThreshold,
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
  if (actualDb && shouldTerminate) {
    try {
      await actualDb.run(
        `UPDATE agents SET status = 'apoptosis', is_apoptotic = 1, current_task = 'Terminated by Apoptosis Sentinel', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        agent
      );
    } catch (e) {
      // Ignore if agent row doesn't exist
    }
  }

  return autopsyReport;
}

function snapshotState(statePayload) {
  return JSON.parse(JSON.stringify(statePayload || {}));
}

const legacyCryptobiosisSnapshots = new Map();

function freezeCryptobiosis(dbOrWorkspaceId, workspaceIdOrReason = 'fleet', reasonOrState = '', statePayload = {}) {
  if (dbOrWorkspaceId && typeof dbOrWorkspaceId.get === 'function' && typeof dbOrWorkspaceId.run === 'function') {
    return freezeCryptobiosisInDatabase(dbOrWorkspaceId, workspaceIdOrReason, reasonOrState, statePayload);
  }

  const workspaceId = dbOrWorkspaceId || 'fleet';
  const reason = workspaceIdOrReason || '';
  const state = snapshotState(reasonOrState || {});
  const snapshot = {
    snapshotId: `cryptobiosis_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    workspaceId,
    reason,
    frozenAt: new Date().toISOString(),
    state
  };
  legacyCryptobiosisSnapshots.set(snapshot.snapshotId, snapshot);
  while (legacyCryptobiosisSnapshots.size > 1024) {
    legacyCryptobiosisSnapshots.delete(legacyCryptobiosisSnapshots.keys().next().value);
  }
  return snapshot;
}

async function freezeCryptobiosisInDatabase(db, workspaceId = 'fleet', reason = '', statePayload = {}) {
  const snapshotId = `cryptobiosis_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const frozenAt = new Date().toISOString();
  const state = snapshotState(statePayload);
  
  if (db) {
    if (workspaceId) {
      const workspace = await db.get('SELECT id FROM workspaces WHERE id = ?', workspaceId);
      if (!workspace) workspaceId = null;
    }
    const agents = state.agents || [];
    let agentId = agents[0]?.id || state.agentId;
    if (agentId && !(await db.get('SELECT id FROM agents WHERE id = ?', agentId))) {
      await db.run("INSERT OR IGNORE INTO agents(id, workspace_id, name, role, status) VALUES (?, ?, ?, 'System', 'idle')", agentId, workspaceId, agentId);
    }
    if (!agentId) {
      agentId = 'agent_system';
      const existing = await db.get('SELECT id FROM agents WHERE id = ?', agentId);
      if (!existing) {
        await db.run("INSERT OR IGNORE INTO agents(id, workspace_id, name, role, status) VALUES (?, ?, 'System Sentinel', 'System', 'idle')", agentId, workspaceId);
      }
    }
    await db.run(
      'INSERT INTO cryptobiosis_snapshots(snapshot_id, id, agent_id, workspace_id, reason, state_json, capsule_hash, status, frozen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      snapshotId, snapshotId, agentId, workspaceId, reason, JSON.stringify(state), snapshotId, 'frozen', frozenAt
    );
  }
  
  return {
    snapshotId,
    workspaceId,
    reason,
    frozenAt,
    state
  };
}

function thawCryptobiosis(dbOrSnapshotId, snapshotId, targetWorkspaceId) {
  if (!dbOrSnapshotId || typeof dbOrSnapshotId.get !== 'function') {
    const legacySnapshot = legacyCryptobiosisSnapshots.get(dbOrSnapshotId);
    if (!legacySnapshot) {
      return {
        success: false,
        code: 'SNAPSHOT_NOT_FOUND',
        error: `Cryptobiosis snapshot '${dbOrSnapshotId}' is not found.`,
        snapshotId: dbOrSnapshotId
      };
    }
    return {
      success: true,
      snapshotId: dbOrSnapshotId,
      workspaceId: targetWorkspaceId || legacySnapshot.workspaceId,
      state: snapshotState(legacySnapshot.state),
      revivedAgentCount: Array.isArray(legacySnapshot.state.agents) ? legacySnapshot.state.agents.length : 0,
      restoredAt: new Date().toISOString()
    };
  }
  return thawCryptobiosisFromDatabase(dbOrSnapshotId, snapshotId, targetWorkspaceId);
}

async function thawCryptobiosisFromDatabase(db, snapshotId, targetWorkspaceId) {
  if (!db) {
    return { success: false, code: 'DB_REQUIRED', error: 'Database required', snapshotId };
  }
  const snapshot = await db.get('SELECT * FROM cryptobiosis_snapshots WHERE snapshot_id = ? OR id = ?', snapshotId, snapshotId);
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
    workspaceId: targetWorkspaceId || snapshot.workspace_id,
    state: snapshotState(JSON.parse(snapshot.state_json || '{}')),
    revivedAgentCount: Array.isArray(JSON.parse(snapshot.state_json || '{}').agents)
      ? JSON.parse(snapshot.state_json || '{}').agents.length
      : 0,
    restoredAt: new Date().toISOString()
  };
}

function hydrateCryptobiosis(snapshot) {
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
