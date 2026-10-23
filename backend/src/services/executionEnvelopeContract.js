'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const values = require('./trinityProvenanceValues');
const { hashWorkspace } = require('./trinitySnapshotService');
const backend = require('../../package.json');

const SCHEMA = 'genos.execution-authority-envelope/v2';
const MAX_EXECUTABLE_BYTES = 256 * 1024 * 1024;

async function build(ctx, input) {
  const mission = ctx.normalizedMission;
  const [snapshotHash, executable] = await Promise.all([
    hashWorkspace(input.workspaceRoot),
    measureExecutable(runtimeExecutable(ctx), input.workspaceRoot)
  ]);
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + input.duration).toISOString();
  const replay = determinism(mission, input.binding, snapshotHash);
  const tools = toolLease(mission);
  return values.canonical({
    schema: SCHEMA,
    runId: input.binding.runId,
    missionId: input.binding.mission.id,
    orchestratorId: input.orchestratorId,
    scope: input.binding.scope,
    bindingHash: input.binding.hash,
    identity: input.identity,
    workspaceRoot: input.workspaceRoot,
    toolLease: tools,
    capabilities: mission.capabilities || [],
    planHash: values.digest(JSON.parse(JSON.stringify(ctx.autonomyPlan || {}))),
    limits: input.binding.budget,
    expiresAt,
    lease: input.lease,
    issuedAt,
    inputSnapshot: { algorithm: 'sha256', hash: snapshotHash, source: 'workspace-content' },
    codeRevision: revision(mission, executable),
    runner: { name: backend.name, version: backend.version, runtime: process.release.name,
      runtimeVersion: process.version },
    executable,
    workspace: { root: input.workspaceRoot, snapshotHash,
      isolation: workspaceIsolation(input.identity) },
    toolAuthority: { lease: tools, expiresAt },
    budgets: authorityBudgets(mission, input.binding.budget),
    evidencePolicy: evidencePolicy(mission),
    determinism: replay,
    stateVersions: { strategyContract: input.binding.strategyContract.version,
      missionAuthority: input.lease?.generation ?? null,
      workerBindingHash: input.binding.workerBindingHash },
    integrity: { nonce: crypto.randomBytes(32).toString('hex'), digest: 'sha256',
      signature: 'gvx-ledger-hmac-sha256' }
  });
}

function runtimeExecutable(ctx) {
  return ctx.authorityExecutable || ctx.executable || process.execPath;
}

function authorityBudgets(mission, runBudget) {
  const worker = mission.workerContract || {};
  const resources = worker.resources || {};
  const policy = mission.executionPolicy || {};
  return values.canonical({ tokens: runBudget.tokens, timeMs: runBudget.latencyMs,
    cpuMs: finite(resources.maxCpuMs ?? mission.executionBudget?.cpuMs),
    costUsd: runBudget.costUsd, events: runBudget.events,
    spawn: finite(worker.spawnBudget ?? policy.workerFanoutLimit),
    delegationDepth: finite(worker.delegationDepth) });
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function determinism(mission, binding, snapshotHash) {
  const enabled = binding.budget.deterministic === true;
  const declared = mission.randomSeed ?? mission.seed;
  const derived = enabled ? values.digest({ runId: binding.runId, snapshotHash }) : null;
  return { enabled, seed: declared ?? derived, clock: 'wall-clock-bounded' };
}

function toolLease(mission) {
  const tools = new Set(Array.isArray(mission.toolLease) ? mission.toolLease : []);
  const worker = mission.workerContract;
  const replayDenied = (mission.deniedTools || []).includes('genos_replay');
  if (worker?.identity?.workerKind && !replayDenied) {
    tools.add('genos_replay');
  }
  return [...tools].sort();
}

function workspaceIsolation(identity) {
  return identity.workspaceId ? 'workspace-bound' : 'path-bound';
}

async function measureExecutable(filename, workspaceRoot) {
  const candidate = path.isAbsolute(filename) ? filename : path.resolve(workspaceRoot, filename);
  const resolved = await fs.realpath(candidate);
  const before = await fs.stat(resolved);
  if (!before.isFile() || before.size > MAX_EXECUTABLE_BYTES) {
    throw values.failure('EXECUTION_AUTHORITY_EXECUTABLE_INVALID');
  }
  const bytes = await fs.readFile(resolved);
  const after = await fs.stat(resolved);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw values.failure('EXECUTION_AUTHORITY_EXECUTABLE_CHANGED');
  }
  return { path: resolved, sha256: values.hashBytes(bytes), bytes: before.size };
}

function revision(mission, executable) {
  const declared = String(mission.codeRevision || process.env.GENOS_BUILD_REVISION || '').trim();
  return declared
    ? { kind: 'declared-revision', value: declared, executableSha256: executable.sha256 }
    : { kind: 'artifact-sha256', value: executable.sha256, executableSha256: executable.sha256 };
}

function evidencePolicy(mission) {
  const declared = mission.evidencePolicy;
  return values.canonical({
    transportSuccessIsEvidence: false,
    promotionRequiresVerifiedReceipt: true,
    independentEvidenceRequired: mission.requiresIndependentEvidence === true,
    declared: declared && typeof declared === 'object' && !Array.isArray(declared) ? declared : null
  });
}

module.exports = { SCHEMA, build, measureExecutable, toolLease };
