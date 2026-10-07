'use strict';
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const manifests = require('./trinityRunManifest');
const traces = require('./trinityTraceEvents');
const values = require('./trinityProvenanceValues');

async function artifact(filename) {
  if (!path.isAbsolute(filename)) throw values.failure('TRINITY_LAUNCH_EXECUTABLE_UNRESOLVED');
  const resolved = await fs.realpath(filename);
  const before = await fs.stat(resolved);
  if (!before.isFile() || before.size > 256 * 1024 * 1024) throw values.failure('TRINITY_LAUNCH_ARTIFACT_INVALID');
  const hash = crypto.createHash('sha256');
  for await (const bytes of createReadStream(resolved)) hash.update(bytes);
  const after = await fs.stat(resolved);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw values.failure('TRINITY_LAUNCH_ARTIFACT_CHANGED');
  return { path: resolved, sha256: hash.digest('hex'), bytes: before.size };
}

async function captureLaunch(input) {
  if (!input.normalizedMission?.missionScope?.trinityExperimentId) return null;
  const workspaceRoot = await fs.realpath(input.workspaceRoot);
  const filenames = [...new Set([input.spawnSpec.cmd, input.resolvedExecutable])];
  const artifacts = await Promise.all(filenames.map(artifact));
  return { schema: 'genos.trinity-launch-observation/v1', observedAt: values.utc(),
    workspaceRoot, runtimeMode: input.runtimeMode || 'supervised', artifacts,
    argumentsHash: values.digest(input.spawnSpec.args),
    nodeVersion: input.spawnSpec.cmd === process.execPath ? process.version : null,
    source: 'control-plane-launcher', qualification: 'artifact-bytes-before-invocation',
    provider: null, model: null, dependencies: 'not-captured', decisionAuthority: 'none' };
}

async function recordLaunch(context, input) {
  if (!context.normalizedMission?.missionScope?.trinityExperimentId) return null;
  const mission = context.normalizedMission;
  const key = { missionId: mission.missionScope.missionId || mission.missionScope.trinityExperimentId,
    runId: context.executionRun.id };
  const manifest = await manifests.read(context.db, key);
  if (!manifest) throw values.failure('TRINITY_RUNTIME_MANIFEST_MISSING');
  require('./trinityRuntimeTrace').assertCorrelation(context, manifest.payload.correlation);
  await require('./trinityCapsuleBinding').assertAnchored(context, manifest);
  const observation = validateObservation(input.observation);
  if (!sameWorkspace(observation.workspaceRoot, mission.workspaceRoot)) throw values.failure('TRINITY_WORKER_SCOPE_INVALID');
  if (!Number.isSafeInteger(input.pid) || input.pid <= 0) throw values.failure('TRINITY_LAUNCH_PID_INVALID');
  return traces.append(context.db, { correlation: manifest.payload.correlation,
    eventId: 'runtime-launch:' + key.runId, stage: 'runtime_launcher', status: 'observed',
    timestamp: observation.observedAt, details: { observation, pid: input.pid,
      bootstrapManifestHash: manifest.hash, observationHash: values.digest(observation) } });
}

function validateObservation(input) {
  if (input?.schema !== 'genos.trinity-launch-observation/v1' || input.source !== 'control-plane-launcher'
    || input.provider !== null || input.model !== null) throw values.failure('TRINITY_LAUNCH_OBSERVATION_INVALID');
  if (!['supervised', 'in-process-native', 'in-process-worker'].includes(input.runtimeMode)) throw values.failure('TRINITY_LAUNCH_OBSERVATION_INVALID');
  values.utc(input.observedAt);
  values.requireHash(input.argumentsHash);
  if (!Array.isArray(input.artifacts) || !input.artifacts.length) throw values.failure('TRINITY_LAUNCH_OBSERVATION_INVALID');
  input.artifacts.forEach(validateArtifact);
  validateQualifications(input);
  values.assertPublic(input);
  return values.clone(input);
}

function validateArtifact(item) {
  values.requireHash(item.sha256);
  if (!path.isAbsolute(item.path) || !Number.isSafeInteger(item.bytes) || item.bytes < 0) throw values.failure('TRINITY_LAUNCH_OBSERVATION_INVALID');
}

function validateQualifications(input) {
  const fields = ['schema', 'observedAt', 'workspaceRoot', 'runtimeMode', 'artifacts', 'argumentsHash',
    'nodeVersion', 'source', 'qualification', 'provider', 'model', 'dependencies', 'decisionAuthority'];
  if (values.encode(Object.keys(input).sort()) !== values.encode(fields.sort())) throw values.failure('TRINITY_LAUNCH_OBSERVATION_INVALID');
  if (input.qualification !== 'artifact-bytes-before-invocation' || input.dependencies !== 'not-captured'
    || input.decisionAuthority !== 'none') throw values.failure('TRINITY_LAUNCH_OBSERVATION_INVALID');
}

function sameWorkspace(left, right) {
  if (typeof right !== 'string' || !path.isAbsolute(right)) return false;
  const roots = [path.resolve(left), path.resolve(right)];
  return process.platform === 'win32' ? roots[0].toLowerCase() === roots[1].toLowerCase() : roots[0] === roots[1];
}

async function recordInProcess(context, entrypoint, runtimeMode) {
  const observation = await captureLaunch({ normalizedMission: context.normalizedMission,
    workspaceRoot: context.normalizedMission.workspaceRoot, resolvedExecutable: entrypoint,
    runtimeMode, spawnSpec: { cmd: process.execPath, args: [entrypoint] } });
  return recordLaunch(context, { observation, pid: process.pid });
}

module.exports = { captureLaunch, recordLaunch, recordInProcess };
