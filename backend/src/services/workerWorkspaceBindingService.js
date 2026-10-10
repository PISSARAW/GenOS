'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');

function refuse(message) {
  throw Object.assign(new Error(message), { code: 'WORKER_WORKSPACE_BINDING_INVALID' });
}

function samePath(left, right) {
  const first = path.resolve(left);
  const second = path.resolve(right);
  return process.platform === 'win32' ? first.toLowerCase() === second.toLowerCase() : first === second;
}

async function verifyCapsule(workspaceRoot, parentPath) {
  if (typeof workspaceRoot !== 'string' || !path.isAbsolute(workspaceRoot)) refuse('Worker capsule path must be absolute.');
  const stat = await fs.lstat(workspaceRoot);
  const [capsuleReal, parentReal] = await Promise.all([fs.realpath(workspaceRoot), fs.realpath(parentPath)]);
  if (!stat.isDirectory() || stat.isSymbolicLink() || samePath(capsuleReal, parentReal)) {
    refuse('Worker capsule must be a separate regular directory.');
  }
  return path.resolve(workspaceRoot);
}

function epochTag(epoch) {
  return `epoch:${createHash('sha256').update(epoch).digest('hex')}`;
}

async function trackedCapsule(db, workerId, capsulePath) {
  const rows = await db.all('SELECT agent_id, epoch FROM agent_capsule_cleanup WHERE workspace_root = ?', capsulePath)
    .catch(() => []);
  if (rows.length !== 1 || (rows[0].agent_id !== workerId
    && !rows[0].agent_id.startsWith(`${workerId}_`))) return null;
  const epoch = await require('./agentWorkspaceLifecycle/epoch').readEpochMarker(capsulePath);
  return epoch && epoch === rows[0].epoch ? epoch : null;
}

async function bindingIdentity(db, input) {
  const parent = await db.get(`SELECT a.id, a.workspace_id, w.path, w.organization_id, w.project_id
    FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`, input.parentId);
  const worker = await db.get('SELECT id, parent_agent_id, workspace_id FROM agents WHERE id = ?', input.workerId);
  if (!parent || !worker || worker.parent_agent_id !== parent.id
    || parent.workspace_id !== input.parentWorkspaceId) refuse('Worker and parent workspace identity do not match.');
  return { parent, worker };
}

function parsedTags(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

async function bindWorkerWorkspace(db, input) {
  const { parent, worker } = await bindingIdentity(db, input);
  const capsulePath = await verifyCapsule(input.workspaceRoot, parent.path);
  const epoch = await trackedCapsule(db, worker.id, capsulePath);
  if (!epoch) refuse('Worker capsule is not tracked by its current ownership marker.');
  const existing = await db.get('SELECT id, tags FROM workspaces WHERE path = ?', capsulePath);
  if (existing) {
    if (worker.workspace_id === existing.id && parsedTags(existing.tags).includes(epochTag(epoch))) return existing.id;
    refuse('Worker capsule path is already registered to another workspace.');
  }
  const id = `worker_workspace_${randomUUID()}`;
  await db.run(`INSERT INTO workspaces
    (id, name, path, visibility, language, tags, organization_id, project_id)
    VALUES (?, ?, ?, 'Private', 'Mixed', ?, ?, ?)`, id, `Worker ${worker.id}`, capsulePath,
  JSON.stringify(['worker_capsule', epochTag(epoch)]), parent.organization_id, parent.project_id);
  const updated = await db.run('UPDATE agents SET workspace_id = ? WHERE id = ? AND parent_agent_id = ?', id, worker.id, parent.id);
  if (updated.changes !== 1) refuse('Worker disappeared before capsule binding.');
  return id;
}

async function bindFleetWorkerWorkspace(db, details) {
  if (details.plan?.trinity?.activated) return;
  details.workspaceId = await bindWorkerWorkspace(db, {
    workerId: details.id, parentId: details.parent.id,
    parentWorkspaceId: details.parent.workspace_id, workspaceRoot: details.workspaceRoot
  });
}

function validDelegationBinding(binding) {
  return Boolean(binding && binding.path && binding.parent_path && binding.visibility === 'Private'
    && !samePath(binding.path, binding.parent_path)
    && binding.organization_id === binding.parent_organization_id
    && binding.project_id === binding.parent_project_id);
}

async function delegation(db, input) {
  const { agent, parent } = input;
  const binding = await db.get(`SELECT w.path, w.visibility, w.tags, w.organization_id,
    w.project_id, p.path AS parent_path, p.organization_id AS parent_organization_id,
    p.project_id AS parent_project_id FROM workspaces w JOIN workspaces p ON p.id = ?
    WHERE w.id = ?`, parent.workspace_id, agent.workspace_id).catch(() => null);
  if (!validDelegationBinding(binding)) return null;
  const tags = parsedTags(binding.tags);
  if (!Array.isArray(tags) || !tags.includes('worker_capsule')) return null;
  const epoch = await trackedCapsule(db, agent.id, binding.path);
  if (!epoch || !tags.includes(epochTag(epoch))) return null;
  return { ...agent, capsuleDispatchParentId: parent.id };
}

module.exports = { bindWorkerWorkspace, bindFleetWorkerWorkspace, delegation };
