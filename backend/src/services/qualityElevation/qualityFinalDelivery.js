'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { digest, fail } = require('./qualityContract');
const paths = require('../workspaceSnapshotPaths');
const integrity = require('./qualityReceiptIntegrity');

function assertContract(value) {
  if (value === undefined) return;
  if (!value || !path.isAbsolute(value.workspaceRoot || '')
    || !paths.isSafeRelative(value.path) || /[:<>|?*]/.test(value.path)
    || path.extname(value.path).toLowerCase() !== '.md') {
    throw fail('GQEL_DELIVERY_PATH_INVALID', 'Final delivery requires a confined relative Markdown path and an absolute workspace.');
  }
}

function contract(request, workspaceRoot) {
  if (request.finalArtifactOutput === undefined) return undefined;
  if (!request.qualityElevation) throw fail('GQEL_DELIVERY_QUALITY_REQUIRED', 'Final delivery requires an explicit quality contract.');
  const value = { workspaceRoot, path: request.finalArtifactOutput?.path };
  assertContract(value);
  return value;
}

function assertUnchanged(current, next) {
  if (digest(current.finalArtifactOutput || null) !== digest(next.finalArtifactOutput || null)) {
    throw fail('GQEL_DELIVERY_CONTRACT_CHANGED', 'The formed final delivery destination cannot change.');
  }
}

async function verifiedText(input) {
  const final = input.finalQuality?.artifact;
  if (input.run.status !== 'COMPLETED' || input.completion?.success !== true
    || !input.finalQuality?.passed || !integrity.authenticated(final)
    || final.teamRunId !== input.run.teamRunId) {
    throw fail('GQEL_DELIVERY_UNVERIFIED', 'Only an accepted collective artifact may be delivered.');
  }
  const stored = await input.db.get('SELECT record_json FROM gqel_final_artifacts WHERE team_run_id=?', input.run.teamRunId);
  if (stored?.record_json !== integrity.encode(final)) throw fail('GQEL_DELIVERY_UNVERIFIED', 'Persisted final artifact does not match delivery.');
  const text = require('./workerQualityContractEnforcer').extractTargetContent({}, final.artifact);
  if (!text.trim() || digest(text) !== final.artifactDigest) throw fail('GQEL_DELIVERY_UNVERIFIED', 'Final delivery bytes do not match the reviewed artifact.');
  return text;
}

async function publish(target, text) {
  const temporary = `${target}.${randomUUID()}.tmp`;
  const handle = await fs.open(temporary, 'wx');
  try { await handle.writeFile(text, 'utf8'); await handle.sync(); }
  finally { await handle.close(); }
  try {
    await fs.link(temporary, target);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (await fs.readFile(target, 'utf8') !== text) throw fail('GQEL_DELIVERY_CONFLICT', 'An existing different deliverable will not be overwritten.');
  } finally { await fs.unlink(temporary); }
}

async function deliver(input) {
  const destination = input.run.finalArtifactOutput;
  if (!destination) return { required: false };
  assertContract(destination);
  const text = await verifiedText(input);
  const target = await paths.assertNoSymlinkPath(destination.workspaceRoot, destination.path);
  await publish(target, text);
  const bytes = await fs.readFile(target);
  if (digest(bytes.toString('utf8')) !== digest(text)) throw fail('GQEL_DELIVERY_HASH_MISMATCH', 'Delivered bytes differ from the reviewed artifact.');
  return { required: true, path: target, sha256: digest(text), bytes: bytes.length,
    teamRunId: input.run.teamRunId, qualityReceiptId: input.finalQuality.artifact.qualityReceiptId };
}

async function resume(db, run) {
  if (run.status !== 'COMPLETED' || !run.finalArtifactOutput) return null;
  const integration = run.execution.integration;
  const receipt = await deliver({ db, run, completion: integration.completion, finalQuality: integration.finalQuality });
  await require('../aTeam/teamRunStore').update({ db, teamRunId: run.teamRunId,
    revision: run.revision, patch: { execution: { ...run.execution, delivery: receipt } } });
  return receipt;
}

module.exports = { assertContract, assertUnchanged, contract, deliver, resume };
