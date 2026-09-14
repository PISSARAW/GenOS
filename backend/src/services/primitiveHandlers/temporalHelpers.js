/**
 * Lot 6 : Primitives Temporelles & Causales — helpers extraits
 */
const telemetry = require('../telemetryObserver');
const { getDatabase } = require('../../db');

function sameValue(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
  return (isPlainObject(value) ? { ...value } : Array.isArray(value) ? [...value] : value);
}

function pickPair(context) {
  return {
    base: context.base || context.baseState || {},
    left: context.left || context.branchA || context.interventionState || {},
    right: context.right || context.branchB || context.currentState || {}
  };
}

function pickResolutions(context) {
  return context.conflictResolution && typeof context.conflictResolution === 'object' ? context.conflictResolution : {};
}

function resolveMergeSources(context) {
  return {
    ...pickPair(context),
    agentId: context.agentId || context.orchestratorId || 'strategy_adapter',
    resolutions: pickResolutions(context)
  };
}

function mergeNestedObjects(entry) {
  const { baseValue, leftValue, rightValue, keyPath } = entry;
  const nested = {};
  const nestedKeys = new Set([...Object.keys(baseValue), ...Object.keys(leftValue), ...Object.keys(rightValue)]);
  for (const nestedKey of nestedKeys) {
    nested[nestedKey] = mergeValue({
      baseValue: baseValue[nestedKey],
      leftValue: leftValue[nestedKey],
      rightValue: rightValue[nestedKey],
      keyPath: `${keyPath}.${nestedKey}`,
      resolutions: entry.resolutions,
      conflicts: entry.conflicts
    });
  }
  return nested;
}

function trivialMergeWinner(baseValue, leftValue, rightValue) {
  if (sameValue(leftValue, rightValue)) return { hit: true, value: cloneValue(leftValue) };
  if (sameValue(leftValue, baseValue)) return { hit: true, value: cloneValue(rightValue) };
  if (sameValue(rightValue, baseValue)) return { hit: true, value: cloneValue(leftValue) };
  return { hit: false, value: null };
}

function resolveConflict(entry) {
  const keyPath = entry.keyPath;
  const resolution = entry.resolutions[keyPath];
  const conflict = { key: keyPath, base: entry.baseValue, left: entry.leftValue, right: entry.rightValue, resolution: resolution || null };
  entry.conflicts.push(conflict);
  if (resolution === 'right') return cloneValue(entry.rightValue);
  return cloneValue(entry.leftValue);
}

function mergeNestedOrConflict(entry) {
  if (isPlainObject(entry.baseValue) && isPlainObject(entry.leftValue) && isPlainObject(entry.rightValue)) {
    return mergeNestedObjects(entry);
  }
  return resolveConflict(entry);
}

function mergeValue(entry) {
  const trivial = trivialMergeWinner(entry.baseValue, entry.leftValue, entry.rightValue);
  if (trivial.hit) return trivial.value;
  return mergeNestedOrConflict(entry);
}

function performCausalMerge(entry) {
  const base = entry.base;
  const left = entry.left;
  const right = entry.right;
  const resolutions = entry.resolutions;
  const merged = { ...base };
  const conflicts = [];
  const allKeys = new Set([...Object.keys(base), ...Object.keys(left), ...Object.keys(right)]);
  for (const key of allKeys) {
    merged[key] = mergeValue({ baseValue: base[key], leftValue: left[key], rightValue: right[key], keyPath: key, resolutions, conflicts });
  }
  const success = conflicts.every((conflict) => conflict.resolution === 'left' || conflict.resolution === 'right');
  return { merged, conflicts, success };
}

async function fetchWorkspaceRows(entry) {
  const db = entry.db;
  const workspaceId = entry.workspaceId;
  const orchestratorFilter = entry.orchestratorId || '';
  const ws = await db.get('SELECT organization_id, project_id FROM workspaces WHERE id = ?', workspaceId);
  const wsOrg = ws && ws.organization_id;
  const wsProj = ws && ws.project_id;
  const orgId = wsOrg || entry.organizationId || null;
  const projId = wsProj || entry.projectId || null;
  return db.all(
    `SELECT s.source_id, s.target_id, s.weight
       FROM memory_synapses s
       JOIN genome_decisions source_node ON source_node.id = s.source_id
       JOIN genome_decisions target_node ON target_node.id = s.target_id
      WHERE ((? IS NOT NULL AND source_node.organization_id = ?)
          OR (? IS NOT NULL AND source_node.project_id = ?)
          OR source_node.created_by IN (SELECT id FROM agents WHERE workspace_id = ?)
          OR target_node.created_by IN (SELECT id FROM agents WHERE workspace_id = ?)
          OR source_node.created_by = ?
          OR target_node.created_by = ?)
      ORDER BY s.last_updated_at DESC LIMIT 100`,
    orgId, orgId, projId, projId, workspaceId, workspaceId, orchestratorFilter, orchestratorFilter
  );
}

async function fetchOrchestratorRows(db, orchestratorId) {
  return db.all(
    `SELECT s.source_id, s.target_id, s.weight
       FROM memory_synapses s
       JOIN genome_decisions source_node ON source_node.id = s.source_id
       JOIN genome_decisions target_node ON target_node.id = s.target_id
      WHERE (source_node.created_by = ? OR target_node.created_by = ?
         OR source_node.created_by IN (SELECT id FROM agents WHERE parent_agent_id = ? OR workspace_id = (SELECT workspace_id FROM agents WHERE id = ?)))
      ORDER BY s.last_updated_at DESC LIMIT 100`,
    orchestratorId, orchestratorId, orchestratorId, orchestratorId
  );
}

async function fetchAllRows(db) {
  return db.all(
    `SELECT s.source_id, s.target_id, s.weight
       FROM memory_synapses s
      ORDER BY s.last_updated_at DESC LIMIT 100`
  );
}

async function fetchMatrixRows(context) {
  const db = await getDatabase();
  const orchestratorId = context.orchestratorId || context.agentId;
  if (context.workspaceId) {
    return fetchWorkspaceRows({
      db,
      workspaceId: context.workspaceId,
      orchestratorId,
      organizationId: context.organizationId,
      projectId: context.projectId
    });
  }
  if (orchestratorId) {
    return fetchOrchestratorRows(db, orchestratorId);
  }
  return fetchAllRows(db);
}

function buildDependencyMatrix(rows) {
  const matrix = {};
  rows.forEach((r) => {
    if (!matrix[r.source_id]) matrix[r.source_id] = {};
    matrix[r.source_id][r.target_id] = r.weight;
  });
  return matrix;
}

function foldAction(turn, actionsCount) {
  const action = turn.action || turn.type || 'step';
  actionsCount[action] = (actionsCount[action] || 0) + 1;
}

function foldFile(turn, modifiedFiles) {
  const file = turn.file || turn.targetFile || turn.path;
  if (file) {
    modifiedFiles.add(file);
  }
}

function foldError(turn, state) {
  if (turn.error || turn.pass === false || turn.success === false) {
    state.errorsEncountered += 1;
  }
}

function foldPatch(turn, state) {
  if (turn.statePatch && typeof turn.statePatch === 'object') {
    Object.assign(state.folded, turn.statePatch);
  }
}

function foldTurn(entry) {
  const turn = entry.turn;
  const state = entry.state;
  foldAction(turn, state.actionsCount);
  foldFile(turn, state.modifiedFiles);
  foldError(turn, state);
  foldPatch(turn, state);
}

function unwrapSteps(value) {
  return Array.isArray(value) ? value : (value.turns || value.steps || []);
}

function pickSteps(context) {
  const baseline = context.baseline || context.actual || context.original || [];
  const candidate = context.candidate || context.counterfactual || context.alternative || [];
  return { baseSteps: unwrapSteps(baseline), candSteps: unwrapSteps(candidate) };
}

function findDivergences(baseSteps, candSteps) {
  const divergences = [];
  const maxLen = Math.max(baseSteps.length, candSteps.length);
  for (let i = 0; i < maxLen; i++) {
    const b = baseSteps[i];
    const c = candSteps[i];
    if (JSON.stringify(b) !== JSON.stringify(c)) {
      divergences.push({ stepIndex: i, base: b || null, candidate: c || null });
    }
  }
  return divergences;
}

async function fetchTrajectoryRow(trajId) {
  const db = await getDatabase();
  return db.get('SELECT * FROM trajectories WHERE id = ?', trajId);
}

function rowToTrajectory(row) {
  let diffLines = [];
  try { diffLines = JSON.parse(row.diff_lines || '[]'); } catch (_) {}
  return { id: row.id, status: row.status, turns: diffLines };
}

async function loadTrajectory(context) {
  let traj = context.trajectory;
  if (!traj && context.trajectoryId) {
    try {
      const row = await fetchTrajectoryRow(context.trajectoryId);
      if (row) {
        traj = rowToTrajectory(row);
      }
    } catch (_) {}
  }
  return traj;
}

function buildFallbackTrajectory(context) {
  return {
    id: context.trajectoryId || `traj_${Date.now()}`,
    status: context.status || 'SUCCESS',
    turns: context.turns || []
  };
}

function ensureTrajectoryTurns(traj) {
  if (!traj.turns || !Array.isArray(traj.turns) || traj.turns.length === 0) {
    traj.turns = [{ step: 1, action: 'baseline_action', status: 'SUCCESS' }];
  }
  return traj;
}

async function handleTrajectoryReplay(context) {
  const trajectoryService = require('../trajectoryService');
  let traj = await loadTrajectory(context);
  if (!traj) {
    traj = buildFallbackTrajectory(context);
  }
  ensureTrajectoryTurns(traj);
  const stepIndex = context.stepIndex ?? context.branchingPoint ?? 1;
  const alterations = context.alterations || context.intervention || {};
  return { replayResult: trajectoryService.counterfactualReplay(traj, stepIndex, alterations), trajId: traj.id };
}

function emitTrajectoryReplayTelemetry(agentId, entry) {
  telemetry.emitEvent({
    eventType: 'TEMPORAL_CAUSAL_REPLAY',
    agentId: agentId || 'strategy_adapter',
    action: 'CAUSAL_REPLAY',
    detail: `Executed trajectory counterfactual replay for ${entry.trajId}`,
    severity: 'info',
    payload: entry.replayResult
  });
}

module.exports = {
  performCausalMerge,
  resolveMergeSources,
  fetchMatrixRows,
  buildDependencyMatrix,
  foldTurn,
  pickSteps,
  findDivergences,
  handleTrajectoryReplay,
  emitTrajectoryReplayTelemetry
};
