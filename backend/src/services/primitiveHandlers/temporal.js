/**
 * Lot 6 : Primitives Temporelles & Causales
 * (causal_replay, mutated_universes, causal_rebase, dependency_matrix, provenance)
 */
const telemetry = require('../telemetryObserver');
const mcpExecutor = require('../mcpExecutor');
const { getDatabase } = require('../../db');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function scopedInputPath(inputFile, workspaceRoot) {
  if (!workspaceRoot || !inputFile) return null;
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, inputFile);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

async function causalReplay(context) {
  // Rejoue une séquence d'événements passés avec une intervention pour observer la divergence causale.
  const agentId = context.agentId || context.orchestratorId;

  if (context.trajectory || context.turns || context.trajectoryId) {
    const trajectoryService = require('../trajectoryService');
    let traj = context.trajectory;
    if (!traj && context.trajectoryId) {
      try {
        const db = await getDatabase();
        const row = await db.get('SELECT * FROM trajectories WHERE id = ?', context.trajectoryId);
        if (row) {
          let diffLines = [];
          try { diffLines = JSON.parse(row.diff_lines || '[]'); } catch (_) {}
          traj = { id: row.id, status: row.status, turns: diffLines };
        }
      } catch (_) {}
    }
    if (!traj) {
      traj = {
        id: context.trajectoryId || `traj_${Date.now()}`,
        status: context.status || 'SUCCESS',
        turns: context.turns || []
      };
    }
    const stepIndex = context.stepIndex ?? context.branchingPoint ?? 1;
    const alterations = context.alterations || context.intervention || {};
    const replayResult = trajectoryService.counterfactualReplay(traj, stepIndex, alterations);

    telemetry.emitEvent({
      eventType: 'TEMPORAL_CAUSAL_REPLAY',
      agentId: agentId || 'strategy_adapter',
      action: 'CAUSAL_REPLAY',
      detail: `Executed trajectory counterfactual replay for ${traj.id}`,
      severity: 'info',
      payload: replayResult
    });

    return { success: true, ...replayResult };
  }

  const inputFile = scopedInputPath(context.inputFile, context.workspaceRoot);
  const outputFile = context.outputFile || `/tmp/causal_report_${Date.now()}.json`;

  if (!inputFile || !fs.existsSync(inputFile)) {
    return { success: false, error: 'Existing inputFile required for causal replay.' };
  }

  const res = await mcpExecutor.execute({
    agentId: agentId || 'strategy_adapter',
    toolName: 'genos_causal_replay_experiment',
    args: { input_file: inputFile, output_file: outputFile }
  });

  telemetry.emitEvent({
    eventType: 'TEMPORAL_CAUSAL_REPLAY',
    agentId: agentId || 'strategy_adapter',
    action: 'CAUSAL_REPLAY',
    detail: `Executed causal replay. Output at ${outputFile}`,
    severity: 'info',
    payload: { success: res.success, outputFile }
  });
  return { success: res.success, outputFile, mcpResult: res };
}

async function mutatedUniverses(context) {
  // Crée plusieurs lignes temporelles alternatives (forks causaux) à partir d'un même point.
  const agentId = context.agentId || context.orchestratorId;
  const boundaryId = context.boundaryId || 'root_boundary';
  const universesCount = context.universesCount || 3;
  const newBoundaries = [];
  
  for (let i = 0; i < universesCount; i++) {
    const newBoundary = `universe_${crypto.randomBytes(4).toString('hex')}`;
    const res = await mcpExecutor.execute({
      agentId: agentId || 'strategy_adapter',
      toolName: 'genos_causality_fork',
      args: { boundary_id: boundaryId, new_boundary_id: newBoundary }
    });
    if (res.success) {
      newBoundaries.push(newBoundary);
    }
  }

  telemetry.emitEvent({
    eventType: 'TEMPORAL_MUTATED_UNIVERSES',
    agentId: agentId || 'strategy_adapter',
    action: 'MUTATED_UNIVERSES',
    detail: `Created ${newBoundaries.length} alternative universes from boundary ${boundaryId}.`,
    severity: 'info',
    payload: { originalBoundary: boundaryId, newBoundaries }
  });
  return { success: newBoundaries.length > 0, universes: newBoundaries };
}

async function causalRebase(context) {
  // Injecte un changement dans le passé et re-calcule le plan d'exécution futur.
  const agentId = context.agentId || context.orchestratorId;
  const graphFile = scopedInputPath(context.graphFile, context.workspaceRoot);
  const injectionStep = context.injectionStep || 'step_1';
  const injectedKeys = context.injectedKeys || ['altered_state'];

  if (!graphFile || !fs.existsSync(graphFile)) {
    return { success: false, error: 'Existing graphFile required for causal rebase.' };
  }

  const res = await mcpExecutor.execute({
    agentId: agentId || 'strategy_adapter',
    toolName: 'genos_rebase_compute_plan',
    args: { graph_file: graphFile, injection_step: injectionStep, injected_keys: injectedKeys }
  });

  telemetry.emitEvent({
    eventType: 'TEMPORAL_CAUSAL_REBASE',
    agentId: agentId || 'strategy_adapter',
    action: 'CAUSAL_REBASE',
    detail: `Rebased causal compute plan at step ${injectionStep}.`,
    severity: 'warning',
    payload: { graphFile, injectionStep, injectedKeys, success: res.success }
  });
  return { success: res.success, mcpResult: res };
}

async function causalMerge(context = {}) {
  // Fusion causale à 3 voies (Base, Branche A / Intervention, Branche B / Courant)
  const base = context.base || context.baseState || {};
  const left = context.left || context.branchA || context.interventionState || {};
  const right = context.right || context.branchB || context.currentState || {};
  const agentId = context.agentId || context.orchestratorId || 'strategy_adapter';

  const merged = { ...base };
  const conflicts = [];
  const allKeys = new Set([...Object.keys(base), ...Object.keys(left), ...Object.keys(right)]);

  for (const key of allKeys) {
    const bVal = JSON.stringify(base[key]);
    const lVal = JSON.stringify(left[key]);
    const rVal = JSON.stringify(right[key]);

    if (lVal === rVal) {
      merged[key] = left[key] !== undefined ? left[key] : right[key];
    } else if (lVal === bVal) {
      merged[key] = right[key];
    } else if (rVal === bVal) {
      merged[key] = left[key];
    } else {
      conflicts.push({ key, base: base[key], left: left[key], right: right[key] });
      merged[key] = left[key]; // Priorise la branche d'intervention résolutoire
    }
  }

  const success = conflicts.length === 0 || context.allowConflictResolution === true;
  telemetry.emitEvent({
    eventType: 'TEMPORAL_CAUSAL_MERGE',
    agentId,
    action: 'CAUSAL_MERGE',
    detail: `Three-way causal merge ${success ? 'succeeded' : 'completed with conflicts'} (${conflicts.length} conflicts).`,
    severity: conflicts.length > 0 ? 'warning' : 'info',
    payload: { conflictCount: conflicts.length, conflicts }
  });

  return { success, merged, conflicts, hasConflicts: conflicts.length > 0 };
}

async function dependencyMatrix(context = {}) {
  // Génère la matrice d'adjacence des dépendances causales d'une séquence.
  const db = await getDatabase();
  const orchestratorId = context.orchestratorId || context.agentId;
  const workspaceId = context.workspaceId;
  
  let rows = [];
  if (workspaceId) {
    rows = await db.all(
      `SELECT s.source_id, s.target_id, s.weight
         FROM memory_synapses s
         JOIN genome_decisions source_node ON source_node.id = s.source_id
         JOIN genome_decisions target_node ON target_node.id = s.target_id
        WHERE (source_node.organization_id = ? OR source_node.project_id = ? OR source_node.created_by = ? OR target_node.created_by = ?)
        ORDER BY s.last_updated_at DESC LIMIT 100`,
      workspaceId, workspaceId, orchestratorId || '', orchestratorId || ''
    );
  } else if (orchestratorId) {
    rows = await db.all(
      `SELECT s.source_id, s.target_id, s.weight
         FROM memory_synapses s
         JOIN genome_decisions source_node ON source_node.id = s.source_id
         JOIN genome_decisions target_node ON target_node.id = s.target_id
        WHERE (source_node.created_by = ? OR target_node.created_by = ?
           OR source_node.created_by IN (SELECT id FROM agents WHERE parent_agent_id = ? OR workspace_id = (SELECT workspace_id FROM agents WHERE id = ?)))
        ORDER BY s.last_updated_at DESC LIMIT 100`,
      orchestratorId, orchestratorId, orchestratorId, orchestratorId
    );
  } else {
    rows = await db.all(
      `SELECT s.source_id, s.target_id, s.weight
         FROM memory_synapses s
        ORDER BY s.last_updated_at DESC LIMIT 100`
    );
  }
  
  const matrix = {};
  rows.forEach(r => {
    if (!matrix[r.source_id]) matrix[r.source_id] = {};
    matrix[r.source_id][r.target_id] = r.weight;
  });

  telemetry.emitEvent({
    eventType: 'TEMPORAL_DEPENDENCY_MATRIX',
    agentId: orchestratorId || 'strategy_adapter',
    action: 'DEPENDENCY_MATRIX',
    detail: `Computed dependency matrix with ${Object.keys(matrix).length} nodes.`,
    severity: 'info',
    payload: { nodeCount: Object.keys(matrix).length }
  });
  return { success: true, matrix, nodeCount: Object.keys(matrix).length };
}

async function stateFold(context = {}) {
  // Pliage déterministe d'historique en état synthétique compact
  const turns = Array.isArray(context.turns) ? context.turns : (context.steps || context.events || []);
  const initial = context.initialState || {};
  const folded = { ...initial };
  const actionsCount = {};
  const modifiedFiles = new Set();
  let errorsEncountered = 0;

  for (const turn of turns) {
    const action = turn.action || turn.type || 'step';
    actionsCount[action] = (actionsCount[action] || 0) + 1;
    if (turn.file || turn.targetFile || turn.path) {
      modifiedFiles.add(turn.file || turn.targetFile || turn.path);
    }
    if (turn.error || turn.pass === false || turn.success === false) {
      errorsEncountered += 1;
    }
    if (turn.statePatch && typeof turn.statePatch === 'object') {
      Object.assign(folded, turn.statePatch);
    }
  }

  folded.totalSteps = turns.length;
  folded.actionsCount = actionsCount;
  folded.modifiedFiles = [...modifiedFiles];
  folded.errorsEncountered = errorsEncountered;
  folded.isClean = errorsEncountered === 0;

  return { success: true, foldedState: folded, stepCount: turns.length };
}

async function causalDiff(context = {}) {
  // Différenciation causale entre trajectoire réelle et alternative
  const baseline = context.baseline || context.actual || context.original || [];
  const candidate = context.candidate || context.counterfactual || context.alternative || [];

  const baseSteps = Array.isArray(baseline) ? baseline : (baseline.turns || baseline.steps || []);
  const candSteps = Array.isArray(candidate) ? candidate : (candidate.turns || candidate.steps || []);

  const divergences = [];
  const maxLen = Math.max(baseSteps.length, candSteps.length);
  for (let i = 0; i < maxLen; i++) {
    const b = baseSteps[i];
    const c = candSteps[i];
    if (JSON.stringify(b) !== JSON.stringify(c)) {
      divergences.push({ stepIndex: i, base: b || null, candidate: c || null });
    }
  }

  return {
    success: true,
    divergenceCount: divergences.length,
    firstDivergenceStep: divergences.length > 0 ? divergences[0].stepIndex : null,
    divergences
  };
}

async function replayDependencies(context = {}) {
  // Rejeu et recalibration ordonnée des dépendances causales aval
  const db = await getDatabase();
  const rootNodeId = context.nodeId || context.decisionId || context.stepId;
  if (!rootNodeId) return { success: false, error: 'nodeId required for replay_dependencies.' };

  const descendants = await db.all(`
    WITH RECURSIVE downstream(id, depth) AS (
      SELECT target_id, 1 FROM memory_synapses WHERE source_id = ?
      UNION
      SELECT s.target_id, d.depth + 1 FROM memory_synapses s
      JOIN downstream d ON s.source_id = d.id
      WHERE d.depth < 10
    )
    SELECT DISTINCT id, depth FROM downstream ORDER BY depth ASC
  `, rootNodeId);

  return {
    success: true,
    rootNodeId,
    affectedCount: descendants.length,
    replayQueue: descendants.map(d => d.id)
  };
}

async function signatureMatch(context = {}) {
  // Correspondance d'empreinte d'incident ou de comportement sur univers parallèles
  const targetSignature = String(context.signature || context.errorPattern || '').toLowerCase();
  const universes = Array.isArray(context.universes) ? context.universes : (context.traces || []);

  const matches = universes.filter(u => {
    const repr = JSON.stringify(u).toLowerCase();
    return targetSignature ? repr.includes(targetSignature) : true;
  });

  const confidence = universes.length > 0 ? Number((matches.length / universes.length).toFixed(4)) : 0;
  return {
    success: true,
    signature: targetSignature,
    evaluatedCount: universes.length,
    matchedCount: matches.length,
    confidence
  };
}

async function recursiveRefinement(context = {}) {
  // Raffinement récursif de reproduction minimale (delta debugging causal)
  const steps = Array.isArray(context.steps) ? context.steps : (context.turns || []);
  if (steps.length <= 1) return { success: true, refinedSteps: steps, reductionPercent: 0 };

  // Élimine les étapes neutres/exploratoires sans impact sur l'issue finale
  const essential = steps.filter(s => s.error || s.classification === 'Breakthrough' || s.isIntervention || s.action === 'execute');
  const finalSteps = essential.length > 0 ? essential : steps.slice(-2);
  const reductionPercent = Number((((steps.length - finalSteps.length) / steps.length) * 100).toFixed(1));

  return {
    success: true,
    originalCount: steps.length,
    refinedCount: finalSteps.length,
    reductionPercent,
    refinedSteps: finalSteps
  };
}

async function futureWorlds(context = {}) {
  // Projection de mondes futurs / branches prospectives
  const branchCount = Math.min(context.branchCount || 3, 10);
  const horizon = context.horizonSteps || 3;
  const currentStatus = context.status || 'running';

  const worlds = [];
  for (let i = 0; i < branchCount; i++) {
    const probability = Number((1 / branchCount).toFixed(2));
    worlds.push({
      worldId: `future_${crypto.randomBytes(4).toString('hex')}`,
      hypothesis: `Trajectory branch ${i + 1}`,
      horizon,
      expectedOutcome: i === 0 ? 'OPTIMAL' : (i === 1 ? 'CONSERVATIVE' : 'RISK_TOLERANT'),
      probability
    });
  }

  return { success: true, worldCount: worlds.length, worlds };
}

async function pairedExecution(context = {}) {
  // Exécution appariée (baseline vs candidat)
  const baselineResult = context.baseline || { status: 'SUCCESS', verified: true };
  const candidateResult = context.candidate || { status: 'SUCCESS', verified: true };

  return {
    success: true,
    pairedExecutionId: `pair_${crypto.randomBytes(4).toString('hex')}`,
    baselineOutcome: baselineResult.status || 'SUCCESS',
    candidateOutcome: candidateResult.status || 'SUCCESS',
    timestamp: new Date().toISOString()
  };
}

async function similarity(context = {}) {
  // Calcul de métrique de similarité sémantique et comportementale
  const left = context.left || context.a || {};
  const right = context.right || context.b || {};

  const leftStr = typeof left === 'string' ? left : JSON.stringify(left);
  const rightStr = typeof right === 'string' ? right : JSON.stringify(right);

  if (leftStr === rightStr) return { success: true, similarityScore: 1.0, metric: 'exact_match' };
  const longer = Math.max(leftStr.length, rightStr.length) || 1;
  const overlap = [...new Set(leftStr.split(/\s+/))].filter(w => rightStr.includes(w)).length;
  const score = Math.min(1.0, Number((overlap / Math.max(1, leftStr.split(/\s+/).length)).toFixed(4)));

  return { success: true, similarityScore: score, metric: 'jaccard_token_overlap' };
}

async function equivalenceVerdict(context = {}) {
  // Verdict d'équivalence fonctionnelle appariée
  const sim = context.similarityScore ?? context.score ?? (context.left && context.right ? (await similarity(context)).similarityScore : 1.0);
  const threshold = Number(context.threshold ?? 0.85);
  const isEquivalent = sim >= threshold;

  return {
    success: true,
    isEquivalent,
    similarityScore: sim,
    threshold,
    verdict: isEquivalent ? 'EQUIVALENT' : 'DIVERGENT'
  };
}

async function provenance(context) {
  // Remonte l'arbre généalogique / causal pour trouver l'origine d'un état ou d'une erreur.
  const db = await getDatabase();
  const targetId = context.targetId || context.agentId;
  if (!targetId) return { success: false, error: 'targetId required for provenance.' };

  const lineage = [];
  let currentId = targetId;
  const visited = new Set();
  let truncated = false;

  // Remonte de parent en parent jusqu'à la racine (max depth 10)
  for (let i = 0; i < 10; i++) {
    if (visited.has(currentId)) return { success: false, error: `Causal provenance cycle detected at '${currentId}'.`, lineage, cycleAt: currentId };
    visited.add(currentId);
    const agent = context.workspaceId
      ? await db.get(`SELECT a.id, a.parent_agent_id, a.lineage_relation, a.current_task FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND w.id = ?`, currentId, context.workspaceId)
      : await db.get(`SELECT id, parent_agent_id, lineage_relation, current_task FROM agents WHERE id = ?`, currentId);
    if (!agent) break;
    
    lineage.push({
      id: agent.id,
      relation: agent.lineage_relation,
      task: agent.current_task
    });
    
    if (!agent.parent_agent_id || agent.parent_agent_id === agent.id) break;
    currentId = agent.parent_agent_id;
  }
  if (lineage.length === 10 && lineage[lineage.length - 1]?.parent_agent_id) truncated = true;

  telemetry.emitEvent({
    eventType: 'TEMPORAL_PROVENANCE',
    agentId: context.orchestratorId || 'strategy_adapter',
    action: 'PROVENANCE',
    detail: `Traced provenance for ${targetId} back ${lineage.length} generations.`,
    severity: 'info',
    payload: { targetId, lineageDepth: lineage.length, rootId: lineage[lineage.length - 1]?.id }
  });
  
  return { success: true, lineage, rootId: lineage[lineage.length - 1]?.id, truncated };
}

module.exports = {
  causalReplay,
  mutatedUniverses,
  causalRebase,
  causalMerge,
  dependencyMatrix,
  stateFold,
  causalDiff,
  replayDependencies,
  signatureMatch,
  recursiveRefinement,
  futureWorlds,
  pairedExecution,
  similarity,
  equivalenceVerdict,
  provenance
};
