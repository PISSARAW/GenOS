'use strict';

const fs = require('node:fs');
const path = require('node:path');

async function createRepeatMission(context, index, baseMissionId) {
  if (context.kind === 'recovery_worker') {
    fs.writeFileSync(path.join(context.worker.workspaceRoot || context.rootWorkspace, 'state.txt'), 'damaged');
  }
  const missionId = `${baseMissionId}-repeat-${index + 1}`;
  const identity = require('../../src/services/missionIdentityService');
  await identity.create(context.db, { missionId, objective: context.scenario.prompt,
    orchestratorAgentId: context.parentId });
  await identity.attachAgent(context.db, { missionId, agentId: context.worker.agentId,
    role: context.kind });
  context.missionId = missionId;
}

async function run({ context, telemetry, autobiography, executeWorkerMission }) {
  const repetitions = process.env.GENOS_COMPLIANCE_NATIVE_ALL === '1'
    ? Math.max(1, Math.min(3, Number(process.env.GENOS_COMPLIANCE_REPETITIONS) || 1)) : 1;
  const baseMissionId = context.missionId;
  let execution = null;
  for (let index = 0; index < repetitions; index += 1) {
    if (index > 0 && baseMissionId) await createRepeatMission(context, index, baseMissionId);
    execution = await executeWorkerMission(context);
    await telemetry.flush(5000);
    await autobiography.flushAutobiographicalCapture();
    if (index === 1) await require('../../src/services/jobWorkerOrchestrator').runMemoryConsolidationOnce();
  }
  return execution;
}

async function runOrObserve(input) {
  const { context, telemetry, autobiography, executeWorkerMission, perceptionProbe } = input;
  if (process.env.GENOS_COMPLIANCE_NATIVE_ALL === '1' && !perceptionProbe.INPUT) {
    return { execution: await run({ context, telemetry, autobiography, executeWorkerMission }),
      perception: null };
  }
  perceptionProbe.prepare(context);
  const observed = await perceptionProbe.executeAndProbe(context, executeWorkerMission);
  if (observed.perception) observed.perception.runtimeSettled
    = await perceptionProbe.settle(context.worker.agentId);
  return observed;
}

module.exports = { run, runOrObserve };
