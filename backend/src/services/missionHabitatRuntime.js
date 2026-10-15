'use strict';

const habitats = require('./habitatRevisionService');
const enforcement = require('./habitatEnforcementService');

function runtimeError(code, message = code) {
  return Object.assign(new Error(message), { code });
}

function selectedReference(mission) {
  const reference = mission.habitatRef || mission.habitat || {};
  return { habitatId: reference.habitatId || mission.habitatId,
    revision: reference.revision || reference.habitatRevision || mission.habitatRevision };
}

function habitatReference(mission = {}) {
  const selected = selectedReference(mission);
  if (!selected.habitatId && selected.revision === undefined) return null;
  if (!selected.habitatId || !Number.isSafeInteger(selected.revision) || selected.revision < 1) {
    throw runtimeError('HABITAT_REFERENCE_INCOMPLETE', 'An explicit habitat requires habitatId and a positive integer revision.');
  }
  return selected;
}

async function missionTenant(ctx) {
  const workspaceId = ctx.normalizedMission.workspaceId || ctx.dispatchedAgent.workspace_id;
  if (!workspaceId) return { organizationId: null, projectId: null };
  const row = await ctx.db.get(`SELECT organization_id AS organizationId,
    project_id AS projectId FROM workspaces WHERE id = ?`, workspaceId);
  if (!row) throw runtimeError('HABITAT_WORKSPACE_NOT_FOUND');
  return row;
}

function expectedRuntimeKinds(mission) {
  if (mission.executor === 'caller_mcp') return new Set(['external', 'self_hosted']);
  return new Set(['process']);
}

function assertRuntimeKind(mission, revision) {
  const runtimeKind = revision.configuration.runtimeKind;
  if (!expectedRuntimeKinds(mission).has(runtimeKind)) {
    throw runtimeError('HABITAT_RUNTIME_MISMATCH', `Runtime '${runtimeKind}' is not implemented by this mission executor.`);
  }
}

function assertNetworkBoundary(revision) {
  const network = revision.configuration.networkPolicy || {};
  if (network.type === 'host' || network.type === 'unrestricted') return;
  throw runtimeError('HABITAT_NETWORK_UNENFORCED', `Network policy '${network.type}' is not enforced by the process runtime.`);
}

function assertIsolationClaims(revision) {
  const assertions = revision.configuration.isolationAssertions || {};
  const unsupported = Object.entries(assertions).find(([, assurance]) => assurance === 'enforced');
  if (unsupported) {
    throw runtimeError('HABITAT_ASSURANCE_UNPROVEN', `Boundary '${unsupported[0]}' has no runtime enforcement receipt.`);
  }
}

function applyWallClockLimit(mission, revision) {
  const limits = revision.configuration.limits || {};
  const unsupported = ['cpuSeconds', 'memoryMb', 'pidCount', 'diskMb', 'outputBytes']
    .find((name) => limits[name] !== null && limits[name] !== undefined);
  if (unsupported) throw runtimeError('HABITAT_LIMIT_UNENFORCED', `Limit '${unsupported}' is not enforced by the process runtime.`);
  if (limits.wallClockMs === null || limits.wallClockMs === undefined) return;
  mission.timeoutMs = Math.min(Number(mission.timeoutMs) || limits.wallClockMs, limits.wallClockMs);
  mission.executionBudget = { ...(mission.executionBudget || {}) };
  mission.executionBudget.latencyMs = Math.min(
    Number(mission.executionBudget.latencyMs) || limits.wallClockMs,
    limits.wallClockMs
  );
}

function assertExistingBinding(binding, reference) {
  if (!binding) return;
  if (binding.habitatId !== reference.habitatId || binding.habitatRevision !== reference.revision) {
    throw runtimeError('HABITAT_BINDING_CONFLICT', 'Mission is already bound to another habitat revision.');
  }
}

async function bindMissionHabitat(ctx) {
  const mission = ctx.normalizedMission;
  if (mission.habitatEnforcementReceipt || mission.habitatEnforcementPlan) {
    throw runtimeError('HABITAT_CALLER_PROOF_FORBIDDEN',
      'Habitat enforcement evidence can only be issued by the backend runtime.');
  }
  const reference = habitatReference(mission);
  if (!reference) return null;
  const missionId = mission.missionId || mission.missionScope?.missionId;
  if (!missionId) throw runtimeError('HABITAT_MISSION_ID_REQUIRED');
  const tenant = await missionTenant(ctx);
  const revision = await habitats.getRevision(ctx.db, { ...reference, ...tenant });
  if (!revision) throw runtimeError('HABITAT_REVISION_NOT_FOUND');
  assertRuntimeKind(mission, revision);
  assertNetworkBoundary(revision);
  assertIsolationClaims(revision);
  applyWallClockLimit(mission, revision);
  let binding = await habitats.missionBinding(ctx.db, { missionId, ...tenant });
  assertExistingBinding(binding, reference);
  if (!binding) binding = await habitats.bindMission(ctx.db, { missionId, ...reference, ...tenant });
  ctx.habitatRevision = revision;
  ctx.habitatBinding = binding;
  ctx.habitat = Object.freeze({ revision, binding,
    enforcementPlan: enforcement.createPlan(revision, binding) });
  mission.habitatBinding = binding;
  return binding;
}

module.exports = { bindMissionHabitat, habitatReference, expectedRuntimeKinds };
