'use strict';

const { fail } = require('./qualityContract');

function nativeFinalRequired(ctx) {
  return Boolean(ctx.normalizedMission.qualityElevation && ctx.dispatchedAgent.execution_mode === 'orchestrator');
}

function assertNativeFinalExecutor(ctx) {
  if (!nativeFinalRequired(ctx)) return;
  const continuous = ctx.normalizedMission.continuousExecution?.mode;
  if (!require('../agentRuntimeExecutable').isLocalRuntime(ctx.executable)
    || ['control', 'observe'].includes(continuous)) {
    throw fail('GQEL_EXECUTOR_UNSUPPORTED', 'Global quality requires the native local final-artifact execution path; this resolved executor has no equivalent GQEL driver.');
  }
}

function prepareNativeFinal(ctx) {
  assertNativeFinalExecutor(ctx);
  if (!nativeFinalRequired(ctx)) return;
  const mission = ctx.normalizedMission;
  const kind = mission.workerKind || finalArtifactKind(mission);
  if (mission.qualityElevation.profile === 'code') assertCodeFinalExecution({ ...mission, workerKind: kind });
  if (require('../agents/workerRuntimeLimitsService').isDeterministicWorkerMission({ ...mission, workerKind: kind })) {
    throw fail('GQEL_EXECUTOR_UNSUPPORTED', 'A deterministic worker method cannot replace native final quality execution.');
  }
  mission.workerKind = kind;
}

function finalArtifactKind(mission) {
  if (mission.qualityElevation.profile === 'code') return 'bounded_worker';
  return mission.qualityElevation.domain === 'creative_writing' ? 'creative_worker' : 'synthesis_worker';
}

function assertCodeFinalExecution(mission) {
  if (!require('../workerEvidenceLocalPrompt').isCodeWorkerMission(mission)
    || mission.executionPolicy?.allowFileEdits !== true) {
    throw fail('GQEL_FINAL_CODE_VERIFICATION_REQUIRED', 'Final code quality requires the authorized protected code-worker and executed-test path.');
  }
}

function executionEntrypoint(ctx, resolveOther) {
  return nativeFinalRequired(ctx) ? require.resolve('../agentFleetService') : resolveOther();
}

function earlyWorker(ctx) {
  if (nativeFinalRequired(ctx)) return false;
  return require('../agentRuntimeAdapter/missionLease').isInProcessWorker(ctx.dispatchedAgent, ctx.normalizedMission, ctx.executable);
}

async function finish(ctx, superviseOther) {
  if (!nativeFinalRequired(ctx)) return superviseOther();
  assertNativeFinalExecutor(ctx);
  await require('../agentWorkspaceLifecycleService').trackWorkspace(ctx.agentId, ctx.normalizedMission.workspaceRoot);
  await require('../trinityRuntimeAttestation').recordInProcess(ctx, require.resolve('../agentFleetService'), 'in-process-final-quality');
  return require('../missionProtocols/runtime').runInProcess(ctx,
    () => require('../agentFleetService').runLocalWorker(ctx.db, ctx.normalizedMission, ctx.executionRun));
}

module.exports = { nativeFinalRequired, assertNativeFinalExecutor, prepareNativeFinal, executionEntrypoint, earlyWorker, finish };
