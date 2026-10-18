'use strict';

const path = require('node:path');
const { importWorkspace, scanWorkspace } = require('./import');
const { createFabric } = require('./index');
const catalog = require('./catalog');
const storage = require('./storage');
const agentGit = require('../agentGitService');

async function prepare(db, artifact) {
  const workspace = await storage.workspace(db, artifact.sourceWorkspaceId);
  const world = await db.get('SELECT workspace_root FROM trinity_worlds WHERE agent_id = ?', artifact.sourceAgentId);
  const source = world?.workspace_root || workspace.path;
  if (path.resolve(source) !== path.resolve(artifact.sourceWorkspace)) {
    throw new Error('Trinity GQWF source workspace identity changed.');
  }
  const base = await importWorkspace(source, workspace.path);
  const candidate = await importWorkspace(artifact.targetWorkspace, workspace.path);
  await storage.putRoot(db, workspace.id, base);
  await storage.putRoot(db, workspace.id, candidate);
  const prepared = { workspaceId: workspace.id, baseHash: base.hash,
    candidateHash: candidate.hash };
  await catalog.checkpointMetadata(db, { workspaceId: workspace.id });
  return prepared;
}

async function signedEvidence(db, input) {
  const object = await db.get('SELECT * FROM agent_git_objects WHERE id = ? AND agent_id = ?',
    input.objectId, input.agentId);
  if (!object || !agentGit.verifyObjectSignature(object)) throw new Error('Trinity GQWF AgentGit evidence is invalid.');
  const metadata = JSON.parse(object.metadata_json || '{}');
  if (metadata.experimentId !== input.experimentId || metadata.candidateWorkspaceId !== input.candidateWorkspaceId
    || metadata.contentHash !== input.contentHash || metadata.gqwfRootHash !== input.prepared.candidateHash
    || metadata.gqwfWorkspaceId !== input.prepared.workspaceId) {
    throw new Error('Trinity GQWF AgentGit evidence does not bind the candidate.');
  }
  return object.id;
}

async function publish(db, input) {
  if (!Array.isArray(input.integrationChecks) || !input.integrationChecks.length
    || input.integrationChecks.some((check) => check.passed !== true)
    || input.claimsCoveredByChecks !== true) {
    throw new Error('Trinity GQWF integration evidence is incomplete.');
  }
  const evidenceId = await signedEvidence(db, input);
  await require('../trinityPromotionIntegrity').assertCandidate(input.artifact, input.contentHash);
  const current = await scanWorkspace(input.artifact.targetWorkspace, false);
  if (current.hash !== input.prepared.candidateHash) throw new Error('Trinity GQWF candidate changed after verification.');
  const { workspaceId, baseHash, candidateHash } = input.prepared;
  const name = `trinity/${input.experimentId}`;
  const fabric = createFabric(db, { verifyPromotion: async () => ({ success: true,
    workspaceId, headName: name, previousHash: baseHash, generation: 0, candidateHash, evidenceId }) });
  await fabric.initializeHead({ workspaceId, name, rootHash: baseHash });
  return fabric.publishCandidate({ workspaceId, name, expectedHash: baseHash,
    expectedGeneration: 0, candidateHash });
}

module.exports = { prepare, publish };
