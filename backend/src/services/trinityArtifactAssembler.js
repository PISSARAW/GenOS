'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { isSensitivePath } = require('./agentWorkspaceLifecycle/constants');
const { hashWorkspace } = require('./trinitySnapshotService');

function fail(reason) {
  throw Object.assign(new Error(reason), { code: 'TRINITY_SYNTHESIS_MANIFEST_INVALID' });
}

function relativePath(value) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value) || value.includes(':')) fail('unsafe_artifact_path');
  const parts = value.replaceAll('\\', '/').split('/');
  if (parts.some(part => !part || part === '.' || part === '..') || isSensitivePath(value)) fail('unsafe_artifact_path');
  if (parts.some(part => ['.git', '.genos-agent-worlds', 'node_modules', 'target'].includes(part))) fail('excluded_artifact_path');
  return parts.join('/');
}

async function confinedPath(root, relative) {
  const base = await fs.realpath(root);
  let current = base;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) fail('symlink_artifact_path');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return current;
}

function validatePlan(plan, worlds) {
  if (!plan || !worlds.some(world => world.worldNumber === plan.baseWorld)) fail('base_world_required');
  if (!Array.isArray(plan.files) || !plan.files.length || plan.files.length > 128) fail('bounded_file_manifest_required');
  const paths = plan.files.map(file => relativePath(file.path));
  const normalized = paths.map(value => process.platform === 'win32' ? value.toLowerCase() : value);
  if (new Set(normalized).size !== paths.length) fail('conflicting_artifact_paths');
  plan.files.forEach(file => validateSource(file, worlds));
  return plan;
}

function validateSource(file, worlds) {
  if (!worlds.some(world => world.worldNumber === file.worldNumber) || !/^[a-f0-9]{64}$/.test(file.sha256 || '')) fail('source_world_and_hash_required');
}

async function assemble(db, input) {
  const { candidate, plan, worlds } = input;
  validatePlan(plan, worlds);
  const prepared = [];
  for (const file of plan.files) prepared.push(await prepareFile(db, { file, candidate, worlds }));
  if (prepared.reduce((sum, item) => sum + item.bytes.length, 0) > 64 * 1024 * 1024) fail('bounded_manifest_size_required');
  for (const item of prepared) {
    await fs.mkdir(path.dirname(item.destination), { recursive: true });
    await fs.writeFile(item.destination, item.bytes);
  }
  const manifest = prepared.map(({ relative, worldNumber, sha256 }) => ({ path: relative, worldNumber, sha256 }));
  return { manifest, contentHash: await hashWorkspace(candidate),
    manifestDigest: crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex') };
}

async function prepareFile(db, input) {
  const { file, candidate, worlds } = input;
  const world = worlds.find(item => item.worldNumber === file.worldNumber);
  const row = await db.get('SELECT workspace_root FROM trinity_worlds WHERE agent_id = ?', world.agentId);
  if (!row?.workspace_root) fail('source_workspace_required');
  const relative = relativePath(file.path);
  const source = await confinedPath(row.workspace_root, relative);
  const stat = await fs.stat(source);
  if (!stat.isFile() || stat.size > 16 * 1024 * 1024) fail('bounded_source_file_required');
  const bytes = await fs.readFile(source);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== file.sha256) fail('source_artifact_hash_mismatch');
  return { relative, worldNumber: file.worldNumber, sha256, bytes,
    destination: await confinedPath(candidate, relative) };
}

module.exports = { assemble, validatePlan };
