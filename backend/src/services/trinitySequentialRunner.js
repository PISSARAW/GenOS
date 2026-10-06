'use strict';
const sequential = require('./trinityAdaptiveSequential');
const dispatch = require('./trinityAdaptiveContinuationRunner');
const barrier = require('./trinityComparativeBarrier');
const journal = require('./trinityExecutionJournal');

function settings(selection, count = 3) {
  const config = selection.sequentialConfig || {};
  validateBudget(config);
  if (!validLimits(config, count) || !validThresholds(config)) throw new Error('Sequential replica limits or thresholds are invalid.');
  return { ...config, minReplicasPerArm: config.minReplicasPerArm ?? 1,
    maxReplicasPerArm: config.maxReplicasPerArm ?? 5, totalBudget: config.replicaBudget, maxTotalReplicas: config.replicaBudget,
    maxRounds: config.replicaBudget, seed: config.seed || 'trinity-sequential-v1' };
}
function validateBudget(config) {
  if (!Number.isSafeInteger(config.replicaBudget) || config.replicaBudget < 3 || config.replicaBudget > 48) throw new Error('Sequential Trinity requires 3 to 48 reserved replicas.');
  if (!Number.isSafeInteger(config.tokensPerReplica) || config.tokensPerReplica <= 0) throw new Error('Sequential Trinity requires a per-replica token budget.');
}
function validLimits(config, count) {
  const min = config.minReplicasPerArm ?? 1, max = config.maxReplicasPerArm ?? 5;
  return Number.isSafeInteger(min) && Number.isSafeInteger(max) && min > 0 && max >= min
    && max <= 5 && config.replicaBudget >= count * min;
}
function validThresholds(config) {
  return [config.infoGainThreshold ?? 0.02, config.minUncertainty ?? 0.05]
    .every(value => Number.isFinite(value) && value >= 0 && value <= 1);
}
async function run(context) {
  const { input, db, reports } = context;
  if (input.variantSelection?.experimentalDesign?.replicationPolicy !== 'adaptive_replica_count') return null;
  try {
    const config = settings(input.variantSelection, reports.length);
    const result = await sequential.runAdaptiveSequentialTrinity({ mission: input.mission,
      worldConfigs: reports.map(world => ({ id: String(world.worldNumber), world })),
      config, db, orchestratorId: input.orchestratorId,
      executeWorld: execution => executeReplica({ ...context, config, execution }) });
    if (result.arms.some(arm => arm.pulls < config.minReplicasPerArm)) return { status: 'incomplete', reason: 'sequential_initial_replication_incomplete' };
    return { status: 'executed', ...result, reports: await barrier.buildWorldReportsFromMission(db, input.missionId),
      decisionAuthority: 'none', estimateAuthority: 'advisory' };
  } catch (error) { return { status: 'incomplete', reason: error.code || error.message }; }
}
async function executeReplica(context) {
  const { db, input, execution } = context;
  const phase = 'sequential_replica_' + execution.round;
  return journal.phase({ db, missionId: input.missionId, configuration: { input, round: execution.round,
    sourceWorld: execution.worldConfig.world.worldNumber } }, phase, () => launchReplica(context));
}
async function launchReplica(context) {
  const { input, db, config, execution, reports } = context;
  const source = execution.worldConfig.world;
  const route = input.variantSelection.worldModelAssignments?.find(item => item.worldNumber === source.worldNumber);
  if (!route) throw new Error('Sequential replica model assignment missing.');
  const workerId = dispatch.replicaId(input.missionId, 'sequential', execution.round);
  const worldNumber = reports.length + execution.round + 1;
  const snapshot = await db.get('SELECT mission_snapshot_hash FROM trinity_experiments WHERE mission_id = ?', input.missionId);
  await db.run("INSERT OR IGNORE INTO trinity_worlds (id, mission, world_number, name, strategy, status, agent_id, experiment_id, chamber, snapshot_hash) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)",
    input.missionId + '_world_' + worldNumber, input.mission, worldNumber, 'Sequential replica ' + execution.round,
    source.role, workerId, input.missionId, source.role, snapshot?.mission_snapshot_hash);
  const payload = replicaPayload({ input, source, route, workerId, config });
  const accepted = await dispatch.dispatchOnce({ db, repoRoot: input.repoRoot, payload });
  if (accepted.workerId !== workerId || accepted.status !== 'accepted') throw new Error('Sequential replica dispatch rejected.');
  await dispatch.waitForContinuation(db, { workerId, afterEventId: 0, startedAt: Date.now() }, input.variantSelection.supervisionTimeoutMs);
  const world = (await barrier.buildWorldReportsFromMission(db, input.missionId)).find(item => item.agentId === workerId);
  if (world?.report?.outcome !== 'success') throw new Error('Sequential replica success evidence missing.');
  return world;
}
function replicaPayload(context) {
  const { input, source, route, workerId, config } = context;
  return { action: 'dispatch_worker', background: true, orchestratorId: input.orchestratorId, workerId,
    missionScope: { missionId: input.missionId, trinityExperimentId: input.missionId, chamber: source.role },
    role: source.role, model_tier: route.modelTier, localModel: route.localModel || undefined,
    mission: input.mission + '\nIndependent sequential replica of hypothesis: ' + (source.report.hypothesis || source.role)
      + '. Return evidence-backed correctness and uncertainty measurements with signed verification receipts.',
    execution_budget: { tokens: config.tokensPerReplica }, executionPolicy: input.variantSelection.workerExecutionPolicy,
    timeoutMs: input.variantSelection.supervisionTimeoutMs };
}
module.exports = { run, settings };
