'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { create } = require('../src/services/agentFleetWorkerWorkspace');

async function main() {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-worker-source-'));
  const fallback = path.join(parent, 'fallback');
  const invalidSource = path.join(parent, 'assigned-source.txt');
  await fs.mkdir(fallback);
  await fs.writeFile(invalidSource, 'the assigned source is a file, not a workspace');
  const previous = process.env.GENOS_WORKSPACE_ROOT;
  const previousCapsule = process.env.GENOS_CAPSULE_ROOT;
  process.env.GENOS_WORKSPACE_ROOT = fallback;
  delete process.env.GENOS_CAPSULE_ROOT;
  try {
    await assert.rejects(create({
      sourceWorkspace: invalidSource,
      parent: { workspace_id: 'parent-workspace' },
      assignment: { role: 'implementation' },
      mission: { executionPolicy: { allowFileEdits: false } },
      assignments: []
    }, 'worker-source-failure'), error => ['EPERM', 'ENOTDIR', 'EISDIR'].includes(error.code));
    assert.deepEqual(await fs.readdir(fallback), [],
      'a missing assigned source must not silently copy a different configured project');
    console.log('Worker source failure does not substitute configured workspace: PASS');
  } finally {
    if (previous === undefined) delete process.env.GENOS_WORKSPACE_ROOT;
    else process.env.GENOS_WORKSPACE_ROOT = previous;
    if (previousCapsule === undefined) delete process.env.GENOS_CAPSULE_ROOT;
    else process.env.GENOS_CAPSULE_ROOT = previousCapsule;
    await fs.rm(parent, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
