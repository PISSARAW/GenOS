'use strict';

const trinityService = require('../src/services/trinityService');
const trinityMissionSupervisor = require('../src/services/trinityMissionSupervisor');
const topologyWorkerKinds = require('../src/services/topologyWorkerKindService');
const trinityAdapters = require('../src/services/trinityAdapters');
const factorial = require('../src/services/trinityFactorialGrid');

function workerAssignmentsFrom(context) {
  return context.request.worker_assignments || context.request.workerAssignments || {};
}

function trinityOptionsFrom(context) {
  return {
    variant: context.request.variant_id || context.request.variantId || context.request.variant,
    jury: context.request.trinity_jury || context.request.trinityJury,
    experimentalDesign: context.request.experimental_design || context.request.experimentalDesign,
    adaptiveBudgetConfig: context.request.trinity_adaptive_budget || context.request.trinityAdaptiveBudget,
    qdConfig: context.request.trinity_qd || context.request.trinityQD
  };
}

function trinityModels() {
  const raw = process.env.GENOS_TRINITY_MODELS || '';
  return raw.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function assignModels(members, models) {
  if (!models.length) return members;
  return members.map((member, index) => ({ ...member, localModel: require('../src/services/trinityWorldDesign').modelFor(member, models, index) }));
}

function missionFrom(context) {
  return context.request.mission || context.request.project_goal || context.request.goal || 'Trinity comparative mission';
}

function composeMembers(mission, options, assignments) {
  const models = trinityModels();
  const composed = trinityService.compose(mission, {
    variantId: options.variant, experimentalDesign: options.experimentalDesign, trinityJury: options.jury,
    adaptiveBudgetConfig: options.adaptiveBudgetConfig,
    qdConfig: options.qdConfig,
    availableAdapters: trinityAdapters.dispatchAdapterNames(), trinityModels: models
  });
  const members = topologyWorkerKinds.applyTopologyWorkerKinds('trinity', assignModels(composed, models), assignments);
  return members;
}

async function handle(input) {
  const { db, context, ensureParent, workerGarage, buildNCEEnrichments, createOrchestratorId, launchWorker } = input;
  const parent = await ensureParent({ db, context });
  const garage = await workerGarage.state(db, context.orchestratorId);
  const mission = missionFrom(context);
  context.nceEnrichments = await buildNCEEnrichments(context, 'trinity');
  const assignments = workerAssignmentsFrom(context);
  const { variant, jury, experimentalDesign, adaptiveBudgetConfig, qdConfig } = trinityOptionsFrom(context);
  const members = composeMembers(mission, { variant, jury, experimentalDesign, adaptiveBudgetConfig, qdConfig }, assignments);
  const missionId = context.request.trinityMissionId
    || `trinity_${context.orchestratorId}_${require('crypto').randomUUID()}`;
  const requiredSlots = await requiredWorldSlots({ db, missionId, members, qdConfig });
  if (garage.available < requiredSlots) throw Object.assign(new Error('Trinity design requires ' + requiredSlots + ' free worker slots'), { code: 'WORKER_GARAGE_FULL' });
  const release = await require('../src/services/trinityExecutionJournal').acquire(db, missionId + ':dispatch');
  try {
  const variantSelection = withDispatchRuntime(members, context.request);
  const sealed = await require('../src/services/trinityDispatchPreparation').prepare(db, {
    context, parent, missionId, mission, members, selection: variantSelection
  });
  await persistDispatchConfig(db, { missionId, mission, variantSelection, juryConfig: jury });
  const accepted = await launchWorlds({ db, context, members, missionId, mission, parent, launchWorker, createOrchestratorId, sealed });
  const supervision = trinityMissionSupervisor.launch({
    missionId, orchestratorId: context.orchestratorId, repoRoot: context.repoRoot
  });
  process.stdout.write(JSON.stringify({ orchestratorId: context.orchestratorId, trinity: {
    status: 'accepted', mission, missionId, variant: members[0]?.variant,
    variantSelection: members[0]?.variantSelection,
    capacity: workerGarage.getDynamicCapacity(context.orchestratorId), worlds: accepted, supervision
  } }));
  } finally { await release(); }
}

async function requiredWorldSlots(context) {
  const { db, missionId, members, qdConfig } = context;
  const existing = await db.all('SELECT w.world_number FROM trinity_worlds w JOIN agents a ON a.id = w.agent_id WHERE w.experiment_id = ?', missionId);
  const launched = new Set(existing.map(world => world.world_number));
  const missing = members.filter(member => !launched.has(member.worldNumber)).length;
  const reserved = existing.length === 0 && usesQDReplicas(members) ? Number(qdConfig.replicaBudget) : 0;
  return missing + reserved;
}

function usesQDReplicas(members) {
  return members[0]?.variantSelection?.experimentalDesign?.replicationPolicy === 'quality_diversity_replicas';
}

function withDispatchRuntime(members, request = {}) {
  const selection = members[0]?.variantSelection;
  if (!selection) return selection;
  return { ...selection,
    recursiveState: { depth: Math.max(0, Number(request.recursiveDepth) || 0),
      spentBudget: Math.max(0, Number(request.recursiveSpentBudget) || 0),
      parentProblemIds: request.recursiveParentProblemIds || [] },
    worldModelAssignments: require('../src/services/trinityWorldDesign').modelAssignments(members),
    supervisionTimeoutMs: supervisionTimeoutMs(request),
    ...replicationConfigs(request),
    recursiveBudgetTokens: request.trinityRecursiveBudgetTokens,
    workerExecutionPolicy: request.executionPolicy || null
  };
}

function replicationConfigs(request) {
  return {
    adaptiveBudgetConfig: request.trinity_adaptive_budget || request.trinityAdaptiveBudget || null,
    qdConfig: request.trinity_qd || request.trinityQD || null,
    sequentialConfig: request.trinity_sequential || request.trinitySequential || null
  };
}

function supervisionTimeoutMs(request = {}) {
  const requested = Number(request.trinitySupervisorTimeoutMs ?? request.timeoutMs);
  if (!Number.isFinite(requested) || requested <= 0) return 180000;
  return Math.min(600000, Math.max(180000, requested));
}

async function persistDispatchConfig(db, config) {
  await db.run(`INSERT OR IGNORE INTO trinity_dispatch_configs
    (mission_id, mission, variant_selection_json, jury_config_json) VALUES (?, ?, ?, ?)`,
  config.missionId, config.mission, JSON.stringify(config.variantSelection || {}),
  config.juryConfig ? JSON.stringify(config.juryConfig) : null);
}

async function launchWorlds(input) {
  const { db, context, members, missionId, mission, parent, launchWorker, createOrchestratorId, sealed } = input;
  const accepted = [];
  for (const member of members) {
    const previous = await db.get('SELECT agent_id, status FROM trinity_worlds WHERE experiment_id = ? AND world_number = ?', missionId, member.worldNumber);
    const existingAgent = previous && await db.get('SELECT status FROM agents WHERE id = ?', previous.agent_id);
    if (previous && (previous.status !== 'queued' || existingAgent)) {
      accepted.push({ workerId: previous.agent_id, worldNumber: member.worldNumber, strategy: member.role, status: previous.status, idempotent: true });
      continue;
    }
    const workerId = previous?.agent_id || createOrchestratorId(`worker_${context.orchestratorId}_${member.worldNumber}`);
    const name = `Trinity Worker (World ${member.worldNumber}: ${member.label})`;
    if (!previous) await db.run(`INSERT INTO trinity_worlds (id, mission, world_number, name, strategy, status, agent_id, experiment_id, chamber, snapshot_hash)
      VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)`, `${missionId}_world_${member.worldNumber}`, mission,
    member.worldNumber, name, member.role, workerId, missionId, member.chamber, sealed.snapshotHash);
    await launchWorker({ db, context, member: { ...member, name, workspaceRoot: sealed.snapshotRoot,
      executionBudgetTokens: sealed.budget.perChamberTokens[member.worldNumber - 1],
      missionScope: { missionId, trinityExperimentId: missionId, chamber: member.chamber } }, index: member.worldNumber, parent, suppliedWorkerId: workerId });
    accepted.push({ workerId, worldNumber: member.worldNumber, strategy: member.role, status: 'accepted' });
  }
  return accepted;
}

module.exports = { handle, withDispatchRuntime, supervisionTimeoutMs };
