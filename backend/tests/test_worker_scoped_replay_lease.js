'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.GENOS_SECRET_KEY ||= 'worker-scoped-replay-test-secret-32-bytes';
const bridge = require('../src/services/mcpExecutor/permissionMembraneBridge');

async function main() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-scoped-replay-'));
  const root = path.join(temporary, 'worker-a');
  const snapshots = path.join(root, '.genos', 'evidence-snapshots');
  fs.mkdirSync(snapshots, { recursive: true });
  const ownedSnapshot = path.join(snapshots, 'run-a.json');
  fs.writeFileSync(ownedSnapshot, JSON.stringify({ snapshot_id: 'snap-a', agent_id: 'worker-a' }));
  const context = (agentId, snapshot) => ({
    db: { get: async (_sql, id) => ({ execution_mode: 'worker', path: id === 'worker-a' ? root : path.join(temporary, id) }) },
    request: { agentId, runId: 'run-a', organizationId: 'org-a', projectId: 'project-a',
      toolName: 'genos_replay', args: { root, snapshot } },
    binding: { status: 'authorized', hash: 'sealed-run', envelope: {
      runId: 'run-a', identity: { agentId }, scope: { entityId: agentId, organizationId: 'org-a', projectId: 'project-a' },
      toolLease: ['genos_replay']
    } },
    policy: { decision: 'allow', reason: 'test' }
  });
  const previousLease = process.env.GENOS_MCP_LEASE;
  try {
    process.env.GENOS_MCP_LEASE = 'genos_snapshot';
    const owner = await bridge.permissionInput(context('worker-a', ownedSnapshot));
    assert.ok(owner.lease.tools.includes('genos_replay'), 'the sealed owner may replay its exact evidence capsule');
    const otherSnapshot = await bridge.permissionInput(context('worker-a', 'snap-other-worker'));
    assert.equal(otherSnapshot.lease.tools.includes('genos_replay'), false, 'a different snapshot remains outside the lease');
    const otherWorker = await bridge.permissionInput(context('worker-b', ownedSnapshot));
    assert.equal(otherWorker.lease.tools.includes('genos_replay'), false, 'a different worker cannot borrow the capsule lease');
    process.stdout.write('Worker replay lease is scoped to its own evidence capsule: PASS\n');
  } finally {
    if (previousLease === undefined) delete process.env.GENOS_MCP_LEASE;
    else process.env.GENOS_MCP_LEASE = previousLease;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
