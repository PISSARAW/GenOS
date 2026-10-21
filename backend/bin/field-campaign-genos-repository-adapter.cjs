#!/usr/bin/env node
'use strict';

/**
 * SHEV field campaign — real repository adapter (P0: workspace + P1: runtime).
 *
 * This adapter implements the four separated roles required by the field
 * protocol: workspace (attestation), runtime (execution), observer
 * (independent measurement), and verifier (independent receipt).
 *
 * Points P0+P1: workspace.ensureArm clones two workspaces issued from the same
 * base commit of a real repository. runtime.executeWindow launches a real
 * GenOS maintenance mission on each workspace and produces a real diff/commit
 * plus content-addressed artifacts. The observer and verifier roles exist but
 * are intentionally unimplemented; they raise a clear error naming P2. They
 * will be replaced by real terrain code in P2.
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

const WORKSPACE_SCHEMA = 'genos.shev-field-workspace-attestation/v1';
const MEASUREMENT_SCHEMA = 'genos.shev-field-window-measurement/v1';

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
    actualCommitHash: commitHash,
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

function ensureArm(expected, workspacesRoot, repo, baseCommit) {
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

function captureCommits(workspaceDir) {
  let before = null;
  let after = null;
  try { before = gitHead(workspaceDir); } catch (_) { before = null; }
  return { before, after: null };
}

function buildArtifact(ctx) {
  const { request, arm, commitBefore, commitAfter, result, durationMs } = ctx;
  const artifact = {
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
    durationMs: result.durationMs || durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
    producedAt: new Date().toISOString()
  };
  return artifact;
}

function runWorkspaceMission(request, workspacesRoot) {
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
    request, arm, commitBefore, commitAfter, result, durationMs: result.durationMs
  });
  const artifactHash = fingerprint(artifact);
  return {
    executionId: `field-execution-${arm}-${request.window.id}`,
    actorId: `field-producer-${arm}`,
    projectId: request.project.projectId,
    workspaceId: request.workspaceId,
    intervention: request.intervention,
    artifactHash
  };
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
  const repo = envOr('GENOS_FIELD_REPO', process.cwd());
  const baseCommit = envOr('GENOS_FIELD_BASE_COMMIT')
    || gitHead(repo);

  return Object.freeze({
    workspace: {
      ensureArm: async (expected) => ensureArm(expected, workspacesRoot, repo, baseCommit)
    },
    runtime: {
      executeWindow: async ({ request, attestation }) =>
        runWorkspaceMission(request, workspacesRoot)
    },
    observer: {
      measureWindow: notImplemented('observer.measureWindow', 'P2')
    },
    verifier: {
      verifyWindow: notImplemented('verifier.verifyWindow', 'P2')
    },
    WORKSPACE_SCHEMA,
    MEASUREMENT_SCHEMA
  });
}

module.exports = { createAdapters, WORKSPACE_SCHEMA, MEASUREMENT_SCHEMA };
