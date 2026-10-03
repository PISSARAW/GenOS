#!/usr/bin/env node
'use strict';

const { getDatabase, closeDatabase } = require('../src/db');
const trinityBarrier = require('../src/services/trinityComparativeBarrier');
const trinityService = require('../src/services/trinityService');
const organization = require('../src/services/dynamicOrganizationService');
const telemetry = require('../src/services/telemetryObserver');
const adversarial = require('../src/services/trinityAdversarialCrossExamination');
const crossExamination = require('../src/services/trinityCrossExaminationService');
const claimGraph = require('../src/services/trinityClaimGraphService');
const jury = require('../src/services/trinityBlindJuryService');
const verifier = require('../src/services/trinityMissionVerifierService');
const temporal = require('../src/services/trinityTemporalHorizons');
const variantRuntime = require('../src/services/trinityVariantRuntime');
const recursiveExecutor = require('../src/services/trinityRecursiveExecutor');
const nestedMissionRunner = require('../src/services/trinityNestedMissionRunner');
const adaptiveContinuation = require('../src/services/trinityAdaptiveContinuationRunner');

const TERMINAL = new Set(['blocked', 'completed', 'terminated', 'apoptosis', 'error', 'failed', 'unverified', 'quarantined']);

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForWorkers(db, missionId, expectedWorlds, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await db.all(
      `SELECT w.agent_id as agentId, a.status FROM trinity_worlds w
       LEFT JOIN agents a ON a.id = w.agent_id WHERE w.id LIKE ? ORDER BY w.world_number`,
      `${missionId}%`
    );
    if (rows.length >= expectedWorlds && rows.every((row) => TERMINAL.has(row.status))) return rows;
    await pause(500);
  }
  throw new Error(`Trinity mission timed out: ${missionId}`);
}

async function publish(db, input) {
  const { orchestratorId, missionId, result, promotion } = input;
  const payload = { missionId, trinityMerge: result, promotion };
  await organization.publish(db, {
    orchestratorId,
    senderAgentId: orchestratorId,
    kind: 'evidence',
    content: JSON.stringify(payload),
    payload,
    signalType: 'plasmid',
    signalData: payload
  });
}

async function supervise(input) {
  const db = await getDatabase();
  try {
    const configuration = await loadDispatchConfig(db, input.missionId);
    await waitForWorkers(db, input.missionId, expectedWorlds(configuration.variantSelection));
    const reports = await trinityBarrier.buildWorldReportsFromMission(db, input.missionId);
    const result = await compareMission(db, { ...input, ...configuration }, reports);
    await trinityService.recordWorldComparison(db, {
      missionId: input.missionId,
      orchestratorId: input.orchestratorId,
      comparison: result.comparativeAnalysis,
      decision: { canMerge: result.canMerge, threshold: 0.70 }
    });
    const promotion = await trinityBarrier.promoteWinner(db, {
      missionId: input.missionId,
      orchestratorId: input.orchestratorId,
      result
    });
    await publish(db, { ...input, result, promotion });
    telemetry.emitEvent({ eventType: 'TRINITY_MISSION_COMPLETED', agentId: input.orchestratorId, action: 'COMPLETE_TRINITY', detail: 'Trinity supervision completed.', payload: { missionId: input.missionId, canMerge: result.canMerge }, severity: 'info' });
  } catch (error) {
    await publish(db, { ...input, result: { canMerge: false, error: error.message }, promotion: { promoted: false } }).catch(() => {});
    telemetry.emitEvent({ eventType: 'TRINITY_MISSION_FAILED', agentId: input.orchestratorId, action: 'FAIL_TRINITY', detail: error.message, payload: { missionId: input.missionId }, severity: 'error' });
  } finally {
    await closeDatabase(db);
  }
}

function expectedWorlds(selection) {
  return selection?.experimentalDesign?.worldTopology === 'factorial_grid' ? 16 : 3;
}

async function loadDispatchConfig(db, missionId) {
  const stored = await db.get('SELECT mission, variant_selection_json, jury_config_json FROM trinity_dispatch_configs WHERE mission_id = ?', missionId);
  if (!stored) throw Object.assign(new Error('Trinity dispatch configuration is missing.'), { code: 'TRINITY_DISPATCH_CONFIG_MISSING' });
  return {
    mission: stored.mission,
    variantSelection: JSON.parse(stored.variant_selection_json || '{}'),
    juryConfig: stored.jury_config_json ? JSON.parse(stored.jury_config_json) : null
  };
}

async function compareMission(db, input, reports) {
  const design = { centralProblem: input.mission, variantSelection: input.variantSelection || {} };
  const adaptiveReview = await runAdaptiveReview({ db, input, reports });
  const activeReports = adaptiveReview?.status === 'executed' ? adaptiveReview.reports : reports;
  const examined = await crossExamination.examine(db, activeReports, { centralProblem: input.mission });
  const worlds = verifier.verifyMissionReports(examined.reports, input.mission);
  const temporalReview = runTemporalReview(input.variantSelection, worlds);
  const recursiveReview = await runRecursiveReview({ db, input, worlds });
  const review = await adversarial.runVariantReview({ db, agentId: input.orchestratorId, design, worlds });
  const graph = claimGraph.build(worlds);
  let result = trinityService.mergeTrinityEvidence(worlds, {
    domain: trinityService.analyzeMission(input.mission).domain,
    threshold: 0.70, claimGraph: graph, variantSelection: input.variantSelection
  });
  result = adversarial.enforceVariantGate(result, review);
  result = enforceAdaptiveGate(result, adaptiveReview);
  result = enforceRecursiveGate(result, recursiveReview);
  if (review) result.comparativeAnalysis.adversarialReview = review;
  if (temporalReview) result.comparativeAnalysis.temporalReview = temporalReview;
  if (recursiveReview) result.comparativeAnalysis.recursiveExecution = recursiveReview;
  if (adaptiveReview) result.comparativeAnalysis.adaptiveBudgetExecution = adaptiveReview;
  const variantExecution = variantRuntime.run({ selection: input.variantSelection, reports: worlds });
  if (Object.keys(variantExecution.executions).length) result.comparativeAnalysis.variantExecution = variantExecution;
  result.jury = await jury.evaluate({
    db, agentId: input.orchestratorId, outcome: result.outcome,
    mission: input.mission, config: input.juryConfig, reports: worlds,
    required: input.variantSelection?.experimentalDesign?.adjudicationPolicy === 'blind_jury_advisory'
      || input.variantSelection?.experimentalDesign?.interactionPolicy === 'jury_deliberation',
    deterministicWinner: result.selectedWorld
  });
  result.comparativeAnalysis.crossExamination = crossExamination.summary(examined);
  result.comparativeAnalysis.claimGraph = graph;
  if (result.jury.status !== 'unavailable') {
    await jury.recordCalibration({ db, experimentId: input.missionId, juryResult: result.jury,
      deterministicOutcome: { selectedWorld: result.selectedWorld } });
  }
  return result;
}

async function runAdaptiveReview(context) {
  const { input, db, reports } = context;
  if (input.variantSelection?.experimentalDesign?.replicationPolicy !== 'adaptive_budget_fixed_replicas') return null;
  try {
    return await adaptiveContinuation.run({ db, reports, selection: input.variantSelection,
      orchestratorId: input.orchestratorId, missionId: input.missionId,
      mission: input.mission, repoRoot: input.repoRoot,
      timeoutMs: 180000, executionPolicy: input.variantSelection.workerExecutionPolicy });
  } catch (error) {
    return { status: 'incomplete', reason: error.code || 'adaptive_continuation_failed' };
  }
}

function enforceAdaptiveGate(result, review) {
  if (!review || review.status === 'executed') return result;
  return { ...result, canMerge: false, outcome: 'ESCALATE_EXPERIMENT', selectedWorld: null,
    mergedEvidence: null, reason: `adaptive_${review.status}:${review.reason || 'continuation_missing'}` };
}

async function runRecursiveReview(context) {
  const { input, db, worlds } = context;
  const selection = input.variantSelection || {};
  const design = selection.experimentalDesign || {};
  if (design.worldTopology !== 'recursive_nesting' && design.hypothesisPolicy !== 'recursive_decomposition') return null;
  const parent = worlds.find((world) => world.report?.claims?.length || world.report?.uncertainties?.length);
  if (!parent) return { status: 'no_subproblem', result: null };
  try {
    return await recursiveExecutor.executeRecursiveTrinity({
      mission: input.mission, parentReport: { ...parent.report, worldNumber: parent.worldNumber },
      depth: Number(selection.recursiveState?.depth) || 0,
      spentBudget: Number(selection.recursiveState?.spentBudget) || 0,
      config: { maxDepth: 3, recursionBudget: 0.3, minMarginalCost: 0.05 },
      runNestedTrinity: (child) => nestedMissionRunner.run({ db, parentAgentId: parent.agentId,
        mission: child.mission, repoRoot: input.repoRoot, timeoutMs: 180000,
        depth: child.depth, spentBudget: child.spentBudget })
    });
  } catch (error) {
    return { status: 'unavailable', reason: error.code || 'nested_dispatch_failed' };
  }
}

function enforceRecursiveGate(result, review) {
  if (!review || ['verified', 'no_subproblem'].includes(review.status)) return result;
  return { ...result, canMerge: false, outcome: 'ESCALATE_EXPERIMENT', selectedWorld: null,
    mergedEvidence: null, reason: `recursive_${review.status}:${review.reason || 'incomplete_nested_evidence'}` };
}

function runTemporalReview(selection, worlds) {
  const design = selection?.experimentalDesign || {};
  if (!['short_medium_long', 'multi_horizon_grid'].includes(design.temporalPolicy)
    && design.worldTopology !== 'temporal_horizons') return null;
  const report = temporal.compareTemporalWorlds(worlds.map((world) => world.report || {}));
  return { ...report, decisionAuthority: 'none' };
}

let input = {};
try { input = JSON.parse(process.argv[2] || '{}'); } catch (error) { process.exitCode = 1; }
if (input.missionId && input.orchestratorId) supervise(input).catch((error) => {
  console.error(`[trinity-supervisor] ${error.stack || error.message}`);
  process.exitCode = 1;
});
