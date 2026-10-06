#!/usr/bin/env node
'use strict';
const { getDatabase, closeDatabase } = require('../src/db');
const trinityBarrier = require('../src/services/trinityComparativeBarrier');
const trinityService = require('../src/services/trinityService');
const organization = require('../src/services/dynamicOrganizationService');
const telemetry = require('../src/services/telemetryObserver');
const { compareMission } = require('../src/services/trinityComparisonRuntime');
const TERMINAL = new Set(['blocked', 'completed', 'terminated', 'apoptosis', 'error', 'failed', 'unverified', 'quarantined']);

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForWorkers(db, config) {
  const { missionId, expectedWorlds, timeoutMs = 180000 } = config;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await db.all(
      `SELECT w.agent_id as agentId, a.status FROM trinity_worlds w
       LEFT JOIN agents a ON a.id = w.agent_id WHERE w.experiment_id = ? AND w.world_number <= ? ORDER BY w.world_number`,
      missionId, expectedWorlds
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
    const reports = await initialReports(db, { ...input, ...configuration });
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
      result, statisticalContract: configuration.statisticalContract
    });
    await publish(db, { ...input, result, promotion });
    telemetry.emitEvent({ eventType: 'TRINITY_MISSION_COMPLETED', agentId: input.orchestratorId, action: 'COMPLETE_TRINITY', detail: 'Trinity supervision completed.', payload: { missionId: input.missionId, canMerge: result.canMerge }, severity: 'info' });
  } catch (error) {
    if (error.code === 'TRINITY_EXECUTION_BUSY') {
      telemetry.emitEvent({ eventType: 'TRINITY_SUPERVISION_ALREADY_ACTIVE', agentId: input.orchestratorId,
        action: 'RESUME_TRINITY', detail: 'Another supervisor owns this mission.', payload: { missionId: input.missionId }, severity: 'info' });
      return;
    }
    await persistFailure(db, input, error);
    process.exitCode = 1;
    await publish(db, { ...input, result: { canMerge: false, error: error.message }, promotion: { promoted: false } }).catch(() => {});
    telemetry.emitEvent({ eventType: 'TRINITY_MISSION_FAILED', agentId: input.orchestratorId, action: 'FAIL_TRINITY', detail: error.message, payload: { missionId: input.missionId }, severity: 'error' });
  } finally {
    await closeDatabase(db);
  }
}

async function initialReports(db, input) {
  const saved = await require('../src/services/trinityExecutionJournal').read(db, input.missionId, 'initial_reports');
  if (saved) return saved;
  const count = expectedWorlds(input.variantSelection);
  const workers = await waitForWorkers(db, { missionId: input.missionId, expectedWorlds: count,
    timeoutMs: input.variantSelection.supervisionTimeoutMs });
  requireSuccessfulWorkers(workers, count);
  const reports = (await trinityBarrier.buildWorldReportsFromMission(db, input.missionId)).filter(world => world.worldNumber <= count);
  requireCompleteReports(reports, count);
  return reports;
}

async function persistFailure(db, input, error) {
  const experiment = await db.get('SELECT id, status FROM trinity_experiments WHERE mission_id = ?', input.missionId);
  if (!experiment || !['sealed_running', 'sealed_complete', 'cross_examining', 'decided', 'promotion_preparing'].includes(experiment.status)) return;
  const status = experiment.status === 'promotion_preparing' ? 'promotion_failed' : 'escalated';
  await require('../src/services/trinityExperimentStore').transition(db, { id: experiment.id, status,
    failureReason: error.code || error.message, decision: { outcome: 'ESCALATE_EXPERIMENT', reason: error.code || error.message },
    evidenceRef: `trinity-runtime-failure:${input.missionId}` });
}

function requireSuccessfulWorkers(workers, expected) {
  if (workers.length !== expected || workers.some((worker) => worker.status !== 'completed')) {
    throw Object.assign(new Error('Trinity comparison requires every expected world worker to complete successfully.'), {
      code: 'TRINITY_WORLD_EXECUTION_INCOMPLETE'
    });
  }
}

function requireCompleteReports(reports, expected) {
  const complete = reports.length === expected && reports.every((report) => {
    const evidence = report.report;
    return evidence?.outcome === 'success'
      && (report.claims.length > 0 || report.tests.length > 0 || evidence.workerArtifact);
  });
  if (!complete) {
    throw Object.assign(new Error('Trinity comparison requires one substantive success evidence report per world.'), {
      code: 'TRINITY_WORLD_EVIDENCE_INCOMPLETE'
    });
  }
}

function expectedWorlds(selection) {
  return selection?.experimentalDesign?.worldTopology === 'factorial_grid' ? 16 : 3;
}

async function loadDispatchConfig(db, missionId) {
  const stored = await db.get('SELECT mission, variant_selection_json, jury_config_json FROM trinity_dispatch_configs WHERE mission_id = ?', missionId);
  if (!stored) throw Object.assign(new Error('Trinity dispatch configuration is missing.'), { code: 'TRINITY_DISPATCH_CONFIG_MISSING' });
  const experiment = await db.get('SELECT design_json, budget_policy_json FROM trinity_experiments WHERE mission_id = ?', missionId);
  const hypothesisDesign = JSON.parse(experiment?.design_json || '{}');
  const budget = JSON.parse(experiment?.budget_policy_json || '{}');
  return {
    mission: stored.mission,
    variantSelection: JSON.parse(stored.variant_selection_json || '{}'),
    juryConfig: stored.jury_config_json ? JSON.parse(stored.jury_config_json) : null,
    statisticalContract: hypothesisDesign.statisticalContract, hypothesisDesign, tokenBudget: budget.totalTokens, maxLatencyMs: budget.maxLatencyMs,
    dimensionThresholds: hypothesisDesign.dimensionThresholds
  };
}

let input = {};
try { input = JSON.parse(process.argv[2] || '{}'); } catch (error) { process.exitCode = 1; }
if (require.main === module && input.missionId && input.orchestratorId) supervise(input).catch((error) => {
  console.error(`[trinity-supervisor] ${error.stack || error.message}`);
  process.exitCode = 1;
});

module.exports = { waitForWorkers, expectedWorlds, requireSuccessfulWorkers, requireCompleteReports, loadDispatchConfig, supervise };
