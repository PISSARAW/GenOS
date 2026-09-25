'use strict';

const trinityService = require('../src/services/trinityService');
const trinityMissionSupervisor = require('../src/services/trinityMissionSupervisor');
const topologyWorkerKinds = require('../src/services/topologyWorkerKindService');

function workerAssignmentsFrom(context) {
  return context.request.worker_assignments || context.request.workerAssignments || {};
}

function trinityOptionsFrom(context) {
  return {
    variant: context.request.variant_id || context.request.variantId || context.request.variant,
    jury: context.request.trinity_jury || context.request.trinityJury,
    experimentalDesign: context.request.experimental_design || context.request.experimentalDesign
  };
}

function missionFrom(context) {
  return context.request.mission || context.request.project_goal || context.request.goal || 'Trinity comparative mission';
}

async function handle(input) {
  const { db, context, ensureParent, workerGarage, buildNCEEnrichments, createOrchestratorId, launchWorker } = input;
  const parent = await ensureParent({ db, context });
  const garage = await workerGarage.state(db, context.orchestratorId);
  if (garage.available < 3) throw Object.assign(new Error('Trinity requires 3 free worker slots'), { code: 'WORKER_GARAGE_FULL' });
  const mission = missionFrom(context);
  context.nceEnrichments = await buildNCEEnrichments(context, 'trinity');
  const assignments = workerAssignmentsFrom(context);
  const { variant, jury, experimentalDesign } = trinityOptionsFrom(context);
  const members = topologyWorkerKinds.applyTopologyWorkerKinds('trinity', trinityService.compose(mission, {
    variant, experimentalDesign, trinityJury: jury, availableAdapters: []
  }), assignments);
  const missionId = `trinity_${context.orchestratorId}_${require('crypto').randomUUID()}`;
  const accepted = await launchWorlds({ db, context, members, missionId, mission, parent, launchWorker, createOrchestratorId });
  const supervision = trinityMissionSupervisor.launch({ missionId, orchestratorId: context.orchestratorId, repoRoot: context.repoRoot });
  process.stdout.write(JSON.stringify({ orchestratorId: context.orchestratorId, trinity: {
    status: 'accepted', mission, missionId, variant: members[0]?.variant,
    variantSelection: members[0]?.variantSelection,
    capacity: workerGarage.getDynamicCapacity(context.orchestratorId), worlds: accepted, supervision
  } }));
}

async function launchWorlds(input) {
  const { db, context, members, missionId, mission, parent, launchWorker, createOrchestratorId } = input;
  const accepted = [];
  for (const member of members) {
    const workerId = createOrchestratorId(`worker_${context.orchestratorId}_${member.worldNumber}`);
    const name = `Trinity Worker (World ${member.worldNumber}: ${member.label})`;
    await db.run(`INSERT INTO trinity_worlds (id, mission, world_number, name, strategy, status, agent_id)
      VALUES (?, ?, ?, ?, ?, 'queued', ?)`, `${missionId}_world_${member.worldNumber}`, mission,
    member.worldNumber, name, member.role, workerId);
    await launchWorker({ db, context, member: { ...member, name }, index: member.worldNumber, parent, suppliedWorkerId: workerId });
    accepted.push({ workerId, worldNumber: member.worldNumber, strategy: member.role, status: 'accepted' });
  }
  return accepted;
}

module.exports = { handle };
