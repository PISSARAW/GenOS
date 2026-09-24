'use strict';
const { randomUUID } = require('crypto');
const { createIsolatedWorkspace, forgetWorkspace } = require('../../agentWorkspaceLifecycleService');
const { resolveContainedPathNoSymlinkSync, normalizeRelativePath } = require('../../pathSafety');
const store = require('../metapopulationStore');

async function provisionDemeWorkspace(input, options = {}) {
  requireContext(input, options);
  const current = await store.getDeme(options.db, input.metapopulationId, input.demeId);
  if (!current) throw Object.assign(new Error('Unknown deme.'), { code: 'METAPOPULATION_DEME_UNKNOWN' });
  if (current.workspacePath) throw Object.assign(new Error('Deme already owns an isolated workspace.'), { code: 'METAPOPULATION_DEME_WORKSPACE_CONFLICT' });
  if (!input.sourceRoot) throw Object.assign(new Error('sourceRoot is required.'), { code: 'METAPOPULATION_WORKSPACE_SOURCE_REQUIRED' });
  const ownerId = `metapop-deme-${randomUUID()}`;
  const workspacePath = await createIsolatedWorkspace(input.sourceRoot, ownerId, { vfs: input.vfs === true });
  try {
    return await store.attachDemeWorkspace(options.db, {
      metapopulationId: input.metapopulationId, demeId: input.demeId, workspacePath, workspaceOwnerId: ownerId,
      localBoundary: normalizeBoundary(input.localBoundary), budget: input.budget || {}
    });
  } catch (error) {
    await forgetWorkspace(ownerId, true);
    throw error;
  }
}

async function assertLocalWrite(input, options = {}) {
  requireContext(input, options);
  const deme = await store.getDeme(options.db, input.metapopulationId, input.demeId);
  if (!deme) throw Object.assign(new Error('Unknown deme.'), { code: 'METAPOPULATION_DEME_UNKNOWN' });
  if (['COLLAPSED', 'QUARANTINED'].includes(deme.status)) throw Object.assign(new Error('Deme is not writable.'), { code: 'METAPOPULATION_DEME_NOT_WRITABLE' });
  try {
    const relativePath = normalizeRelativePath(input.relativePath, 'deme write path');
    if (!deme.workspacePath || !isAllowedPath(relativePath, deme.localBoundary)) throw new Error('Write is outside the deme boundary.');
    return resolveContainedPathNoSymlinkSync(deme.workspacePath, relativePath, 'deme write path');
  } catch (error) {
    await store.quarantineDemeForBoundaryViolation(options.db, {
      metapopulationId: input.metapopulationId, demeId: input.demeId, relativePath: String(input.relativePath || '')
    });
    throw Object.assign(new Error('Write crosses the deme boundary.'), { code: 'METAPOPULATION_BOUNDARY_VIOLATION', cause: error });
  }
}

function normalizeBoundary(paths = []) {
  if (!Array.isArray(paths)) throw Object.assign(new Error('localBoundary must be an array.'), { code: 'METAPOPULATION_DEME_BOUNDARY_INVALID' });
  return [...new Set(paths.map((value) => normalizeRelativePath(value, 'local boundary')))];
}

function isAllowedPath(relativePath, boundary) {
  return Array.isArray(boundary) && boundary.some((root) => relativePath === root || relativePath.startsWith(`${root}/`));
}

function requireContext(input, options) {
  if (!options.db || !input?.metapopulationId || !input?.demeId) {
    throw Object.assign(new Error('Database, metapopulationId and demeId are required.'), { code: 'METAPOPULATION_CONTEXT_REQUIRED' });
  }
}
module.exports = { provisionDemeWorkspace, assertLocalWrite };
