const { getDatabase, withTransaction } = require('../db');
const { resolveConflictIntoState } = require('./conscienceMerge.js');
const { canonicalize } = require('./evaluationGraders.js');
const crypto = require('crypto');

const persistTails = new Map();

async function persistConscienceState({ db, agentId, state, options = {} }) {
  const previousTail = persistTails.get(agentId) || Promise.resolve();
  const operation = previousTail.catch(() => {}).then(() => persistConscienceStateNow({ db, agentId, state, retry: true, options }));
  const tracked = operation.catch(() => {}).finally(() => { if (persistTails.get(agentId) === tracked) persistTails.delete(agentId); });
  persistTails.set(agentId, tracked);
  return operation;
}

async function persistConscienceStateNow({ db, agentId, state, retry = true, options = {} }) {
  return withTransaction(db, (tx) => persistConscienceTransaction({ db: tx, agentId, state, retry, options }));
}

async function persistConscienceTransaction({ db, agentId, state, retry, options }) {
  const previous = await db.get('SELECT dissonance_level, eureka_count, cognitive_budget, cognitive_baseline_budget, cognitive_max_dissonance, is_apoptotic, conscience_revision, updated_at FROM agents WHERE id = ?', agentId);
  if (!previous) throw new Error(`Agent ${agentId} not found in database for conscience persistence`);
  const result = await db.run(`UPDATE agents SET dissonance_level = ?, eureka_count = ?, cognitive_budget = ?, cognitive_baseline_budget = ?, cognitive_max_dissonance = ?, is_apoptotic = ?, status = CASE WHEN ? = 1 THEN 'apoptosis' ELSE status END, conscience_revision = conscience_revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND conscience_revision = ?`, state.dissonanceLevel, state.eurekaMoments, state.currentBudget, state.baselineBudget, state.maxDissonanceThreshold, state.isApoptotic ? 1 : 0, state.isApoptotic ? 1 : 0, agentId, state.revision);
  if (result.changes !== 1) return resolveConscienceConflict({ db, agentId, state, retry, options }, previous);
  await insertConscienceTransition(db, { agentId, previous, state, options });
  state.revision += 1;
}

async function resolveConscienceConflict(context, previous) {
  const { db, agentId, state, retry, options } = context;
  if (!retry) throw new Error(`Conscience state conflict for agent ${agentId} at revision ${state.revision}`);
  const current = await db.get('SELECT dissonance_level, eureka_count, cognitive_budget, cognitive_baseline_budget, cognitive_max_dissonance, is_apoptotic, conscience_revision, updated_at FROM agents WHERE id = ?', agentId);
  if (!current) throw new Error(`Conscience state conflict for agent ${agentId} at revision ${state.revision}`);
  if (resolveConflictIntoState(state, previous, current) === 'current') return;
  state.revision = Math.max(0, Math.floor(Number(current.conscience_revision) || 0));
  return persistConscienceTransaction({ ...context, retry: false });
}

async function insertConscienceTransition(db, { agentId, previous, state, options }) {
  const reason = String(options.reason || 'evaluation');
  await db.run(`INSERT INTO conscience_transitions (agent_id, from_revision, to_revision, from_dissonance, to_dissonance, from_budget, to_budget, from_apoptotic, to_apoptotic, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, agentId, previous.conscience_revision, state.revision + 1, previous.dissonance_level, state.dissonanceLevel, previous.cognitive_budget, state.currentBudget, previous.is_apoptotic ? 1 : 0, state.isApoptotic ? 1 : 0, reason);
}

async function loadConscienceState({ db, agentId }) {
  try {
    const row = await db.get('SELECT dissonance_level, eureka_count, cognitive_budget, cognitive_baseline_budget, cognitive_max_dissonance, is_apoptotic, conscience_revision FROM agents WHERE id = ?', agentId);
    if (!row) return { currentBudget: 100.0, baselineBudget: 100.0, dissonanceLevel: 0.0, eurekaMoments: 0, isApoptotic: false, maxDissonanceThreshold: 50.0, revision: 0, eurekaWindowStartedAt: 0, eurekaWindowCount: 0 };
    const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    return { currentBudget: Math.max(0, numberOr(row.cognitive_budget, 100.0)), baselineBudget: Math.max(0, numberOr(row.cognitive_baseline_budget, 100.0)), dissonanceLevel: Math.max(0, numberOr(row.dissonance_level, 0.0)), eurekaMoments: Math.max(0, Math.floor(numberOr(row.eureka_count, 0))), isApoptotic: Boolean(row.is_apoptotic), maxDissonanceThreshold: Math.max(0.000001, numberOr(row.cognitive_max_dissonance, 50.0)), revision: Math.max(0, Math.floor(numberOr(row.conscience_revision, 0))), eurekaWindowStartedAt: 0, eurekaWindowCount: 0 };
  } catch (error) { throw new Error(`Unable to load conscience state for agent ${agentId}: ${error.message}`); }
}

async function recordProvenance({ subjectType, subjectId, payload, parentHash = null, scope = {} }) {
  const db = await getDatabase();
  if (parentHash) {
    const parent = scope.organizationId && scope.projectId ? await db.get('SELECT id FROM provenance_records WHERE payload_hash = ? AND organization_id = ? AND project_id = ?', parentHash, scope.organizationId, scope.projectId) : await db.get('SELECT id FROM provenance_records WHERE payload_hash = ? AND organization_id IS NULL AND project_id IS NULL', parentHash);
    if (!parent) throw Object.assign(new Error(`Provenance parent '${parentHash}' was not found.`), { code: 'PROVENANCE_PARENT_NOT_FOUND' });
  }
  const payloadJson = JSON.stringify(canonicalize(payload));
  const payloadHash = crypto.createHash('sha256').update(payloadJson).digest('hex');
  const id = `prov-${crypto.randomUUID()}`;
  await db.run('INSERT INTO provenance_records (id, subject_type, subject_id, payload_hash, parent_hash, payload_json, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, subjectType, subjectId, payloadHash, parentHash, payloadJson, scope.organizationId || null, scope.projectId || null);
  return { id, subjectType, subjectId, payloadHash, parentHash, algorithm: 'sha256' };
}

module.exports = { persistConscienceState, persistConscienceStateNow, persistConscienceTransaction, resolveConscienceConflict, insertConscienceTransition, loadConscienceState, recordProvenance };