'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { resolveContainedPathNoSymlinkSync } = require('../../pathSafety');
const { provisionDemeWorkspace } = require('../demes/demeIsolationService');
const store = require('../metapopulationStore');

async function provisionResidentWorkspace(context) {
  const { db, metapopulationId, demeId, daemonId, ttlMs } = context;
  const existing = await store.getDeme(db, metapopulationId, demeId);
  if (!existing) throw workspaceError('METAPOPULATION_DEME_UNKNOWN');
  if (existing.workspacePath) return existing;
  const budget = { limits: { maintenance: ttlMs || 600000 }, used: {} };
  const sourceRoot = context.sourceRoot || context.options?.sourceRoot;
  const localBoundary = context.localBoundary || ['state', 'memory', 'artifacts'];
  if (sourceRoot) return provisionDemeWorkspace({ metapopulationId, demeId, sourceRoot,
    localBoundary, budget }, { db });
  const root = resolveContainedPathNoSymlinkSync(process.cwd(),
    '.genos-agent-worlds/resident-demes', 'resident workspace root');
  await fs.mkdir(root, { recursive: true });
  const workspacePath = await fs.mkdtemp(path.join(root, 'deme-'));
  try {
    return await store.attachDemeWorkspace(db, { metapopulationId, demeId, workspacePath,
      workspaceOwnerId: daemonId, localBoundary, budget });
  } catch (error) {
    await fs.rmdir(workspacePath);
    throw error;
  }
}

function workspaceError(code) { return Object.assign(new Error(code), { code }); }

module.exports = { provisionResidentWorkspace };
