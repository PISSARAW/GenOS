#!/usr/bin/env node
'use strict';

/**
 * SHEV field campaign — real repository adapter (P0: workspace + P1: runtime + P2: observer/verifier).
 *
 * This adapter implements the four separated roles required by the field
 * protocol: workspace (attestation), runtime (execution), observer
 * (independent measurement), and verifier (independent receipt).
 *
 * Points P0+P1+P2:
 *   workspace.ensureArm   — clones two workspaces issued from the same base commit
 *   runtime.executeWindow — launches a real GenOS maintenance mission per arm
 *   observer.measureWindow — measures real tests/errors/interventions/cost/tokens/duration/pressure
 *   verifier.verifyWindow  — independently re-reads the proofs and emits a receipt
 *
 * Nothing in a window outcome is pre-determined by arm: every value is derived
 * from the actual execution artifact (exit code, stdout/stderr, duration, commit).
 *
 * Environment:
 *   GENOS_FIELD_REPO        — source repository to clone (default: cwd)
 *   GENOS_FIELD_BASE_COMMIT — base commit SHA (default: HEAD of the repo)
 *
 * Usage: node bin/field-campaign-genos-repository-adapter.cjs
 * The module exports createAdapters(context) for use with
 * bin/run-shev-field-campaign.cjs --adapter bin/field-campaign-genos-repository-adapter.cjs
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { fingerprint } = require('../src/services/stateFingerprint');
const { MEASUREMENT_SCHEMA, pressureValues, progressVerdict, buildMeasurement } = require('./field-campaign-measurement.cjs');

const WORKSPACE_SCHEMA = 'genos.shev-field-workspace-attestation/v1';

const ROOT = path.resolve(__dirname, '..');
const ORCHESTRATE = path.join(ROOT, 'bin', 'genos-orchestrate.cjs');

function envOr(name, fallback) {
  const value = process.env[name];
  return value !== undefined && value !== '' ? value : fallback;
}

function sh(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed (${command} ${args.join(' ')}): ${result.stderr}`);
  }
  return (result.stdout || '').trim();
}

function gitHead(dir) {
  return sh('git', ['-C', dir, 'rev-parse', 'HEAD']);
}

function workspaceAttestation(expected, commitHash) {
  const body = {
    schema: WORKSPACE_SCHEMA,
    campaignId: expected.campaignId,
    manifestHash: expected.manifestHash,
    arm: expected.arm,
    projectId: expected.projectId,
    workspaceId: expected.workspaceId,
    isolatedFrom: expected.isolatedFrom,
    initialSnapshotHash: expected.initialSnapshotHash,
    modelLock: expected.modelLock,
    toolsLock: expected.toolsLock,
    permissionsHash: expected.permissionsHash,
    intervention: expected.intervention,
    ...(expected.campaignBudget && { campaignBudget: expected.campaignBudget }),
    ...(expected.runtimeLock && { runtimeLock: expected.runtimeLock }),
    ...(expected.environmentLock && { environmentLock: expected.environmentLock }),
    ...(expected.interventionAttestation
      && { interventionAttestation: expected.interventionAttestation }),
    attestorId: `field-workspace-attestor-${expected.arm}`,
    evidenceRefs: [
      fingerprint(commitHash),
      expected.runtimeLock?.evidenceHash,
      expected.environmentLock?.evidenceHash,
      expected.interventionAttestation?.evidenceHash
    ].filter(Boolean)
  };
  return { ...body, attestationHash: fingerprint(body) };
}

function ensureArm(input) {
  const { expected, workspacesRoot, repo, baseCommit } = input;
  const arm = expected.arm;
  const destDir = path.join(workspacesRoot, arm);
  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  if (!fs.existsSync(path.join(destDir, '.git'))) {
    sh('git', ['clone', '--no-checkout', repo, destDir]);
  }
  sh('git', ['-C', destDir, 'checkout', baseCommit]);
  sh('git', ['-C', destDir, 'reset', '--hard', baseCommit]);
  const actual = gitHead(destDir);
  if (actual !== baseCommit) {
    throw new Error(`Workspace ${arm} resolved to ${actual}, expected ${baseCommit}`);
  }
  return workspaceAttestation(expected, actual);
}

function missionPayload(request, workspaceDir) {
  return {
    mission: `repository-maintenance-correctness-v1:${request.window.id}`,
    task: request.window.taskHash,
    contextHash: request.window.contextHash,
    phase: request.phase,
    arm: request.arm,
    intervention: request.intervention,
    projectId: request.project.projectId,
    workspaceId: request.workspaceId,
    workspace: workspaceDir,
    scheduledAt: request.window.scheduledAt,
    painExpected: request.window.painExpected
  };
}

function runOrchestrator(workspaceDir, payload) {
  const started = Date.now();
  const result = spawnSync(process.execPath, [ORCHESTRATE], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: workspaceDir,
    timeout: 300000
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status,
    signal: result.signal || null,
    error: result.error ? result.error.message : null,
    durationMs: Date.now() - started
  };
}

function buildArtifact(ctx) {
  const { request, arm, commitBefore, commitAfter, result } = ctx;
  return {
    schema: 'genos.shev-field-window-artifact/v1',
    windowId: request.window.id,
    phase: request.phase,
    arm,
    intervention: request.intervention,
    projectId: request.project.projectId,
    workspaceId: request.workspaceId,
    commitBefore,
    commitAfter,
    exitCode: result.exitCode,
    signal: result.signal,
    error: result.error,
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
    producedAt: new Date().toISOString()
  };
}

function artifactFile(artifactsRoot, arm, windowId) {
  return path.join(artifactsRoot, arm, `${windowId}.json`);
}

function writeArtifact(file, artifact) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(artifact, null, 2)}\n`);
}

function readArtifact(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function runWorkspaceMission(request, workspacesRoot, artifactsRoot) {
  const arm = request.arm;
  const workspaceDir = path.join(workspacesRoot, arm);
  if (!fs.existsSync(path.join(workspaceDir, '.git'))) {
    throw new Error(`Workspace ${arm} is not prepared (missing .git).`);
  }
  const commitBefore = gitHead(workspaceDir);
  const payload = missionPayload(request, workspaceDir);
  const result = runOrchestrator(workspaceDir, payload);
  let commitAfter = commitBefore;
  try { commitAfter = gitHead(workspaceDir); } catch (_) { commitAfter = commitBefore; }
  const artifact = buildArtifact({
    request, arm, commitBefore, commitAfter, result
  });
  const artifactHash = fingerprint(artifact);
  writeArtifact(artifactFile(artifactsRoot, arm, request.window.id), artifact);
  return {
    executionId: `field-execution-${arm}-${request.window.id}`,
    actorId: `field-producer-${arm}`,
    projectId: request.project.projectId,
    workspaceId: request.workspaceId,
    intervention: request.intervention,
    artifactHash
  };
}

function computeMetrics(artifact) {
  const summary = artifact.missionSummary || parseMissionSummary(artifact.stdout);
  const usage = summary.measured_usage;
  if (require('./field-campaign-genos-repository-adapterValues1.cjs').computeMetricsValue2({ Number, usage })) {
    throw fieldEvidenceError('SHEV_FIELD_USAGE_UNVERIFIED',
      'Mission has no complete run-bound provider token and cost measurements.');
  }
  if (require('./field-campaign-genos-repository-adapterValues1.cjs').computeMetricsValue4({ artifact, summary })) {
    throw fieldEvidenceError('SHEV_FIELD_MISSION_UNVERIFIED',
      'The mission did not exit successfully with an allowed completion gate.');
  }
  const events = Array.isArray(summary.telemetry) ? summary.telemetry : [];
  const regressions = events.filter((event) => ['AGENT_FAILED', 'TOOL_CALL_FAILED',
    'MISSION_COMPLETION_BLOCKED', 'TEST_FAILED'].includes(event.event_type)).length;
  const humanInterventions = events.filter((event) =>
    /^(HUMAN_DECISION|HUMAN_APPROVAL|HUMAN_OVERRIDE)$/.test(event.event_type || '')).length;
  const pain = events.map((event) => ({ event, payload: parseObject(event.payload_json) }))
    .find(({ event, payload }) => event.event_type === 'SHEV_PAIN_OBSERVED'
      && /^[a-f0-9]{64}$/.test(payload?.evidenceHash || ''));
  const evaluation = summary.independentEvaluation;
  const pressure = require('./field-campaign-genos-repository-adapterValues1.cjs').computeMetricsValue5({ Number, evaluation, require, summary });
  return require('./field-campaign-genos-repository-adapterValues1.cjs').computeMetricsValue3({ Boolean, Number, artifact, humanInterventions, pain, pressure, regressions, usage });
}

function parseMissionSummary(stdout) {
  const lines = String(stdout || '').trim().split(/\r?\n/).reverse();
  for (const line of lines) {
    const start = line.indexOf('{');
    if (start < 0) continue;
    try {
      const parsed = JSON.parse(line.slice(start));
      if (parsed && typeof parsed === 'object' && parsed.token_usage) return parsed;
    } catch (_) {}
  }
  throw fieldEvidenceError('SHEV_FIELD_SUMMARY_UNVERIFIED',
    'GenOS emitted no parseable terminal mission summary.');
}

function parseObject(value) {
  try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch (_) { return {}; }
}

function fieldEvidenceError(code, message) { return Object.assign(new Error(message), { code }); }

function armEvidenceRefs(request) {
  return [
    request.runtimeLock?.evidenceHash,
    request.environmentLock?.evidenceHash,
    request.interventionAttestation?.evidenceHash
  ].filter(Boolean);
}

function receiptEvidenceRefs(outcome, request) {
  return [
    outcome.artifactHash,
    outcome.painObservationHash,
    outcome.clearanceEvidenceHash,
    ...armEvidenceRefs(request)
  ].filter(Boolean);
}

function notImplemented(role, point) {
  return async () => {
    throw new Error(`${role} is not implemented yet: see point ${point}.`);
  };
}

async function createAdapters(context) {
  const store = context.store;
  const campaignDir = store && store.campaignDir ? store.campaignDir : process.cwd();
  const workspacesRoot = path.join(campaignDir, 'workspaces');
  const artifactsRoot = path.join(campaignDir, 'window-artifacts');
  const repo = envOr('GENOS_FIELD_REPO', process.cwd());
  const baseCommit = envOr('GENOS_FIELD_BASE_COMMIT')
    || gitHead(repo);

  const measureWindow = async ({ request, execution, attestation }) => {
    const file = artifactFile(artifactsRoot, request.arm, request.window.id);
    const artifact = readArtifact(file);
    if (!artifact) {
      throw new Error(`No artifact found for ${request.arm}:${request.window.id}`);
    }
    if (fingerprint(artifact) !== execution.artifactHash) {
      throw new Error(`Artifact hash mismatch for ${request.arm}:${request.window.id}`);
    }
    const metrics = computeMetrics(artifact);
    return buildMeasurement(request, execution, metrics);
  };

  const verifyWindow = async (context) => {
    const { request, execution, measurement, outcome } = context;
    const file = artifactFile(artifactsRoot, request.arm, request.window.id);
    const artifact = readArtifact(file);
    assertVerifierArtifact({ artifact, request, execution });
    assertOutcomeBinding(measurement, outcome);
    const verified = Boolean(execution.artifactHash && measurement.measurementHash);
    return {
      verified,
      verifierId: `field-verifier-${request.arm}`,
      executionId: execution.executionId,
      measurementHash: measurement.measurementHash,
      projectId: request.project.projectId,
      workspaceId: request.workspaceId,
      initialSnapshotHash: request.initialSnapshotHash,
      intervention: request.intervention,
      executionMode: request.mode || 'field',
      conditionsHash: request.conditionsHash || null,
      artifactHash: outcome.artifactHash,
      outcomeHash: fingerprint(outcome),
      interventionAttestation: request.interventionAttestation || null,
      evidenceRefs: receiptEvidenceRefs(outcome, request)
    };
  };

  return Object.freeze({
    workspace: {
      ensureArm: async (expected) => ensureArm({ expected, workspacesRoot, repo, baseCommit })
    },
    runtime: {
      executeWindow: async ({ request, attestation }) =>
        runWorkspaceMission(request, workspacesRoot, artifactsRoot)
    },
    observer: { measureWindow },
    verifier: { verifyWindow },
    WORKSPACE_SCHEMA,
    MEASUREMENT_SCHEMA
  });
}

function assertVerifierArtifact(input) {
  const { artifact, request, execution } = input;
  if (!artifact) {
    throw new Error(`Verifier: no artifact for ${request.arm}:${request.window.id}`);
  }
  if (fingerprint(artifact) !== execution.artifactHash) {
    throw new Error(`Verifier: artifact hash mismatch for ${request.arm}:${request.window.id}`);
  }
}

function assertOutcomeBinding(measurement, outcome) {
  if (measurement.outcome.artifactHash !== outcome.artifactHash) {
    throw new Error('Verifier: outcome artifact binding broken.');
  }
}

module.exports = { createAdapters, WORKSPACE_SCHEMA, MEASUREMENT_SCHEMA,
  parseMissionSummary, computeMetrics, pressureValues, progressVerdict, buildMeasurement };
