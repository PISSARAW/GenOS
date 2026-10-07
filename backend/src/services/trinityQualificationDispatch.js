'use strict';
const qualification = require('./trinityQualificationContract');
const manifests = require('./trinityRunManifest');
const traces = require('./trinityTraceEvents');
const path = require('node:path');

function contractForRequest(request, mission) {
  if (!request.trinityContract) return null;
  const result = qualification.validate(request.trinityContract);
  if (!result.valid || result.legacy) throw failure('TRINITY_QUALIFICATION_CONTRACT_INVALID');
  const contract = qualification.publicProjection(request.trinityContract);
  if (contract.originalMission.text !== mission) throw failure('TRINITY_ORIGINAL_MISSION_CHANGED');
  return contract;
}

function instruction(request, mission) {
  const contract = contractForRequest(request, mission);
  return contract ? qualification.promptInstruction(contract) : '';
}

function assertReplay(design, input) {
  const contract = contractForRequest(input.context.request, input.mission);
  const stored = design.qualificationContract || null;
  if (manifestsHash(stored) !== manifestsHash(contract)) throw failure('TRINITY_EXPERIMENT_ID_CONFLICT');
  if (!design.runManifest) return;
  manifests.verify(design.runManifest);
  const hashes = input.members.map(member => manifestsHash(promptInput(member)));
  if (JSON.stringify(design.workerPromptHashes) !== JSON.stringify(hashes)) throw failure('TRINITY_EXPERIMENT_ID_CONFLICT');
}

async function seal(input) {
  const { context, missionId, mission, members, snapshotHash } = input;
  const contract = contractForRequest(context.request, mission);
  const revision = await require('./trinityRevisionCapture').capture(context.repoRoot);
  const correlation = { missionId, experimentId: missionId, parentId: context.orchestratorId,
    runId: 'dispatch:' + missionId, workspaceRoot: input.snapshotRoot, snapshotHash };
  const manifest = manifests.build({ correlation, revision, originalMission: mission, contract,
    publicPrompt: members.map(promptInput),
    fixture: contract?.fixtures || [], verifier: contract?.verificationRefs || [],
    requestedRuntime: requestedRuntime(context.request), workers: plannedWorkers(members),
    toolLeases: [] });
  return { qualificationContract: contract, qualificationStatus: contract ? 'contract_recorded' : 'legacy_unqualified',
    workerProfiles: members.map(member => member.workerProfile || require('./trinityWorkerProfiles').describe(member)),
    runManifest: manifest, workerPromptHashes: members.map(member => manifestsHash(promptInput(member))) };
}

function promptInput(member) { return { mission: member.mission || null, hypothesis: member.hypothesis || null }; }

function plannedWorkers(members) {
  return members.map(member => ({ worldNumber: member.worldNumber || null, role: member.role || null,
    workerKind: member.workerKind || null, chamber: member.chamber || null, modelTier: member.modelTier || null,
    requestedModel: member.localModel || null, observedRuntime: { status: 'unknown' } }));
}

function requestedRuntime(mission) {
  return { executor: mission.executor || null, localRuntime: mission.localRuntime === true,
    model: mission.localModel || null, modelTier: mission.modelTier || null,
    parameters: mission.runtimeParameters || null, seed: mission.seed ?? null };
}

async function recordStarted(context) {
  const { db, normalizedMission: mission } = context;
  const experimentId = mission.missionScope?.trinityExperimentId;
  if (!experimentId) return null;
  const world = await db.get('SELECT id, world_number, snapshot_hash, workspace_root FROM trinity_worlds WHERE experiment_id = ? AND agent_id = ?', experimentId, context.agentId);
  if (!world) throw failure('TRINITY_WORKER_SCOPE_INVALID');
  const row = await db.get('SELECT mission_id, design_json FROM trinity_experiments WHERE id = ?', experimentId);
  if (!row) throw failure('TRINITY_WORKER_SCOPE_INVALID');
  const design = JSON.parse(row?.design_json || '{}');
  assertWorkerScope(context, { world, design, row, experimentId });
  if (design.runManifest) manifests.verify(design.runManifest);
  const input = { world, design, experimentId };
  await manifests.initialize(db);
  const previous = await manifests.read(db, runtimeCorrelation(context, input));
  const { manifest, correlation, contract } = runtimeManifest(context, { ...input, previous });
  await manifests.persist(db, manifest);
  await require('./trinityCapsuleBinding').anchor(context, manifest);
  await traces.append(db, { correlation, stage: 'worker_runtime', status: 'started', eventId: 'worker-runtime:' + context.executionRun.id,
    details: { manifestHash: manifest.hash, qualificationStatus: contract ? 'contract_recorded' : 'legacy_unqualified',
      authorityHash: manifestsHash({ workerContract: mission.workerContract, executionPolicy: mission.executionPolicy,
        missionExecutionAuthority: mission.missionExecutionAuthority, capabilityManifest: mission.capabilityManifestJson }) } });
  return manifest;
}

function assertWorkerScope(context, input) {
  const mission = context.normalizedMission;
  const missionId = mission.missionScope.missionId || input.experimentId;
  if (missionId !== (input.row.mission_id || input.experimentId)) throw failure('TRINITY_WORKER_SCOPE_INVALID');
  if (input.design.orchestratorId && mission.orchestratorAgentId !== input.design.orchestratorId) throw failure('TRINITY_WORKER_SCOPE_INVALID');
  if (workspacePath(mission.workspaceRoot) !== workspacePath(input.world.workspace_root)) throw failure('TRINITY_WORKER_SCOPE_INVALID');
}

function workspacePath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw failure('TRINITY_WORKER_SCOPE_INVALID');
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function runtimeManifest(context, input) {
  const { normalizedMission: mission } = context;
  const { world, design } = input;
  const contract = design.qualificationContract || null;
  const correlation = runtimeCorrelation(context, input);
  const manifest = manifests.build({ correlation, revision: design.runManifest?.payload.revision || {},
    originalMission: contract?.originalMission.text || design.dispatchMission || design.centralProblem || '',
    contract, publicPrompt: mission.prompt, fixture: contract?.fixtures || [], verifier: contract?.verificationRefs || [],
    timestamp: input.previous?.payload.timestamp.value,
    requestedRuntime: requestedRuntime(mission), workers: [{ workerId: context.agentId,
      worldNumber: world.world_number, role: mission.role, workerKind: mission.workerKind }],
    toolLeases: [{ id: 'effective-worker-lease', sha256: manifestsHash(mission.toolLease || []), toolIds: mission.toolLease || [] }] });
  return { manifest, correlation, contract };
}

function runtimeCorrelation(context, input) {
  const mission = context.normalizedMission;
  return { missionId: mission.missionScope.missionId || input.experimentId, experimentId: input.experimentId,
    worldId: input.world.id, workerId: context.agentId, runId: context.executionRun.id, parentId: mission.orchestratorAgentId,
    tenantId: context.dispatchedAgent?.organization_id || null, workspaceRoot: mission.workspaceRoot,
    snapshotId: context.genosCapsule?.snapshotId || null,
    snapshotHash: input.world.snapshot_hash };
}

function manifestsHash(value) {
  return require('./trinityExecutionJournal').digest(value);
}
function failure(code) { return Object.assign(new Error(code), { code }); }
module.exports = { contractForRequest, instruction, assertReplay, seal, recordStarted };
