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

const temporalHelpers = require('./temporalHelpers');

async function causalReplay(context) {
  // Rejoue une séquence d'événements passés avec une intervention pour observer la divergence causale.
  const strategyId = agentId || 'strategy_adapter';
  if (context.trajectory || context.turns || context.trajectoryId) {
    const { replayResult, trajId } = await temporalHelpers.handleTrajectoryReplay(context);

    temporalHelpers.emitTrajectoryReplayTelemetry(strategyId, { replayResult, trajId });

    return { success: true, ...replayResult };
  }

  return runMcpReplay(context, strategyId);
}

async function runMcpReplay(context, strategyId) {
  const inputFile = scopedInputPath(context.inputFile, context.workspaceRoot);
  const outputFile = scopedInputPath(context.outputFile || `causal_report_${Date.now()}.json`, context.workspaceRoot);

  if (!inputFile || !fs.existsSync(inputFile)) {
    return { success: false, error: 'Existing inputFile required for causal replay.' };
  }
  if (!outputFile) {
    return { success: false, error: 'outputFile must stay inside workspaceRoot for causal replay.' };
  }

  const res = await mcpExecutor.execute({
    agentId: strategyId,
    toolName: 'genos_causal_replay_experiment',
    args: { input_file: inputFile, output_file: outputFile }
  });

  telemetry.emitEvent({
    eventType: 'TEMPORAL_CAUSAL_REPLAY',
    agentId: strategyId,
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
  const { base, left, right, agentId, resolutions } = temporalHelpers.resolveMergeSources(context);
  const { merged, conflicts, success } = temporalHelpers.performCausalMerge({ base, left, right, resolutions });

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
  const rows = await temporalHelpers.fetchMatrixRows(context);
  const matrix = temporalHelpers.buildDependencyMatrix(rows);
  const nodeCount = Object.keys(matrix).length;

  telemetry.emitEvent({
    eventType: 'TEMPORAL_DEPENDENCY_MATRIX',
    agentId: context.orchestratorId || context.agentId || 'strategy_adapter',
    action: 'DEPENDENCY_MATRIX',
    detail: `Computed dependency matrix with ${nodeCount} nodes.`,
    severity: 'info',
    payload: { nodeCount }
  });
  return { success: true, matrix, nodeCount };
}

async function stateFold(context = {}) {
  // Pliage déterministe d'historique en état synthétique compact
  const turns = Array.isArray(context.turns) ? context.turns : (context.steps || context.events || []);
  const initial = context.initialState || {};
  const state = {
    folded: { ...initial },
    actionsCount: {},
    modifiedFiles: new Set(),
    errorsEncountered: 0
  };

  for (const turn of turns) {
    temporalHelpers.foldTurn({ turn, state });
  }

  state.folded.totalSteps = turns.length;
  state.folded.actionsCount = state.actionsCount;
  state.folded.modifiedFiles = [...state.modifiedFiles];
  state.folded.errorsEncountered = state.errorsEncountered;
  state.folded.isClean = state.errorsEncountered === 0;

  return { success: true, foldedState: state.folded, stepCount: turns.length };
}

async function causalDiff(context = {}) {
  // Différenciation causale entre trajectoire réelle et alternative
  const { baseSteps, candSteps } = temporalHelpers.pickSteps(context);
  const divergences = temporalHelpers.findDivergences(baseSteps, candSteps);

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

const {
  recursiveRefinement,
  futureWorlds,
  pairedExecution,
  similarity,
  equivalenceVerdict
} = require('./temporalEvaluation');

async function provenance(context) {
  const provenanceResolver = require('../provenanceResolver');
  return provenanceResolver.resolveProvenance(context);
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
