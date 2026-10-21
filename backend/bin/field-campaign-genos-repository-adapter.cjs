#!/usr/bin/env node
'use strict';

/**
 * SHEV field campaign — real repository adapter (point P0: scaffolding + workspace).
 *
 * This adapter implements the four separated roles required by the field
 * protocol: workspace (attestation), runtime (execution), observer
 * (independent measurement), and verifier (independent receipt).
 *
 * Point P0: only workspace.ensureArm is real. It clones two workspaces issued
 * from the same base commit of a real repository (one per arm) and attests
 * their isolation. The runtime, observer and verifier roles exist but are
 * intentionally unimplemented; they raise a clear error naming the point that
 * implements them. They will be replaced by real terrain code in P1 and P2.
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
      executeWindow: notImplemented('runtime.executeWindow', 'P1')
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
