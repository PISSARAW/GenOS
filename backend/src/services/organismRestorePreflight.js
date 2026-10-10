'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const workspaceSnapshots = require('./workspaceSnapshotStore');
const workspacePaths = require('./workspaceSnapshotPaths');
const persistedState = require('./organismPersistedState');
const orchestrator = require('./organismOrchestratorCheckpoint');
const runtime = require('./localRuntimeCheckpoint');
const codex = require('./codexRuntimeCheckpoint');
const { loadAgentForScope } = require('../controllers/lineage/helpers');

const DOMAIN_NAMES = ['agent', 'workspace', 'persistedState', 'orchestrator', 'runtime'];
const BLOCKER_MESSAGES = Object.freeze({
  agent: 'The snapshot seal or agent identity is invalid.',
  workspace: 'The workspace snapshot cannot be verified.',
  persistedState: 'The saved organism state cannot be restored safely.',
  orchestrator: 'The Rust mission checkpoint cannot be verified.',
  runtime: 'The runtime must be stopped and its checkpoint verified.'
});

function blocked(receipt, domain, error) {
  receipt.domains[domain] = { status: 'blocked' };
  receipt.blockers.push({ domain, code: error.code || 'ORGANISM_RESTORE_PREFLIGHT_FAILED',
    message: BLOCKER_MESSAGES[domain] });
}

async function check(receipt, domain, operation) {
  try { receipt.domains[domain] = { status: await operation() }; }
  catch (error) { blocked(receipt, domain, error); }
}

function reject(code, message) {
  throw Object.assign(new Error(message), { code, status: 409 });
}

async function checkAgent(context) {
  const { db, scope, agent, state } = context;
  const current = agent?.id && await loadAgentForScope(db, scope, agent.id);
  if (!current || !state || state.id !== current.id || state.workspace_id !== current.workspace_id) {
    reject('ORGANISM_SNAPSHOT_OWNER_MISMATCH', 'Snapshot agent or workspace identity mismatch.');
  }
  const integrity = require('../controllers/lineage/snapshots').verifyOrganismSnapshot(state);
  if (!integrity.valid || integrity.legacy || state._genosSnapshot?.schemaVersion !== 5) {
    reject('ORGANISM_SNAPSHOT_INTEGRITY_FAILED', 'A sealed organism snapshot is required for restore inspection.');
  }
  return current;
}

async function verifyPayload(snapshot, manifest) {
  for (const file of manifest.files) {
    const filePath = await workspacePaths.assertNoSymlinkPath(manifest.payloadRoot, file.path);
    const bytes = await fs.readFile(filePath);
    if (bytes.length !== file.size || crypto.createHash('sha256').update(bytes).digest('hex') !== file.hash) {
      reject('ORGANISM_WORKSPACE_PAYLOAD_INVALID', `Workspace snapshot payload is corrupt: ${file.path}`);
    }
  }
  return snapshot;
}

async function checkWorkspace(context) {
  const { db, scope, agent, state } = context;
  const reference = state._genosSnapshot.workspaceSnapshot;
  if (!agent.workspace_id && !reference) return 'not-applicable';
  assertWorkspaceReference(reference, agent);
  const workspace = await db.get(`SELECT w.id, w.path FROM workspaces w WHERE w.id = ? AND ${scope.clause}`,
    agent.workspace_id, ...scope.params);
  if (!workspace?.path) reject('ORGANISM_WORKSPACE_UNAVAILABLE', 'Agent workspace is unavailable.');
  const snapshot = await workspaceSnapshots.getSnapshot(db, workspace.id, reference.id);
  assertWorkspaceSnapshot(snapshot, reference, workspace);
  const manifest = await workspaceSnapshots.readManifest(snapshot);
  if (manifest.agent_id !== agent.id || manifest.snapshot_id !== reference.id) {
    reject('ORGANISM_WORKSPACE_SNAPSHOT_MISMATCH', 'Workspace snapshot agent or identifier mismatch.');
  }
  await verifyPayload(snapshot, manifest);
  return 'ready';
}

function assertWorkspaceReference(reference, agent) {
  if (!reference?.id || reference.workspaceId !== agent.workspace_id) {
    reject('ORGANISM_WORKSPACE_SNAPSHOT_MISMATCH', 'Workspace snapshot reference does not match the agent.');
  }
}

function assertWorkspaceSnapshot(snapshot, reference, workspace) {
  if (snapshot.id !== reference.id || snapshot.snapshot_hash !== reference.hash
    || path.resolve(snapshot.workspace_path) !== path.resolve(workspace.path)) {
    reject('ORGANISM_WORKSPACE_SNAPSHOT_MISMATCH', 'Workspace snapshot hash or path changed.');
  }
}

async function checkPersisted(context) {
  const payload = context.state._genosSnapshot.persistedState;
  if (!payload) reject('ORGANISM_STATE_MISSING', 'Persisted organism sections are unavailable.');
  await persistedState.inspectRestore(context.db, context.agent.id, { payload, scope: context.scope });
  return 'ready';
}

async function checkOrchestrator(context) {
  const references = context.state._genosSnapshot.orchestratorCheckpoints;
  if (!Array.isArray(references) || !await orchestrator.verify(references)) {
    reject('ORGANISM_ORCHESTRATOR_CHECKPOINT_INVALID', 'Rust mission checkpoint reference is invalid.');
  }
  await orchestrator.assertCoherent(context.db, { agentId: context.agent.id,
    references, scope: context.scope });
  return references.length ? 'ready' : 'not-applicable';
}

async function checkRuntime(context) {
  const { db, agent, state } = context;
  if (agent.runtime_pid || require('./agentOrchestrationState').activeProcesses.has(agent.id)) {
    reject('ORGANISM_RESTORE_RUNTIME_ACTIVE', 'Stop the agent runtime before restoring.');
  }
  const row = state._genosSnapshot.persistedState.sections.runtime;
  runtime.captured(row);
  await codex.captured(db, row, agent.id);
  return row ? 'ready' : 'not-applicable';
}

async function inspect(context) {
  const receipt = { ready: false, blockers: [], domains: Object.fromEntries(DOMAIN_NAMES.map((name) =>
    [name, { status: 'not-applicable' }])), globalAtomic: false,
    runtimeRestartRequired: false, readinessScope: 'instantaneous' };
  let agent;
  try { agent = await checkAgent(context); receipt.domains.agent = { status: 'ready' }; }
  catch (error) { blocked(receipt, 'agent', error); return receipt; }
  const verified = { ...context, agent };
  await check(receipt, 'workspace', () => checkWorkspace(verified));
  await check(receipt, 'persistedState', () => checkPersisted(verified));
  await check(receipt, 'orchestrator', () => checkOrchestrator(verified));
  if (receipt.domains.persistedState.status !== 'blocked') {
    await check(receipt, 'runtime', () => checkRuntime(verified));
    if (receipt.domains.runtime.status !== 'blocked') {
      const row = context.state._genosSnapshot.persistedState.sections.runtime;
      receipt.runtimeRestartRequired = Boolean(runtime.resumable(row) || codex.parse(row)
        || context.state.status === 'running');
    }
  }
  receipt.ready = receipt.blockers.length === 0;
  return receipt;
}

module.exports = { inspect };
