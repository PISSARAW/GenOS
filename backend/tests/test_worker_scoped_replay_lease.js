'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.GENOS_SECRET_KEY ||= 'worker-scoped-replay-test-secret-32-bytes';
const bridge = require('../src/services/mcpExecutor/permissionMembraneBridge');
const dispatch = require('../src/services/mcpExecutor/dispatch');
const toolLogic = require('../src/services/mcpExecutor/transports/toolLogic');
const { directToolLeaseAllows } = require('../src/services/mcpExecutor/config');

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
      runId: 'run-a', missionId: 'mission-a', identity: { agentId },
      scope: { entityId: agentId, organizationId: 'org-a', projectId: 'project-a' },
      toolLease: ['genos_replay']
    } },
    policy: { decision: 'allow', reason: 'test' }
  });
  const previousLease = process.env.GENOS_MCP_LEASE;
  try {
    process.env.GENOS_MCP_LEASE = 'genos_snapshot';
    const owner = await bridge.permissionInput(context('worker-a', ownedSnapshot));
    assert.ok(owner.lease.tools.includes('genos_replay'), 'the sealed owner may replay its exact evidence capsule');
    assert.equal(await bridge.scopedReplayAuthorized(context('worker-a', ownedSnapshot).db,
      context('worker-a', ownedSnapshot).request, context('worker-a', ownedSnapshot).binding), true);
    const otherSnapshot = await bridge.permissionInput(context('worker-a', 'snap-other-worker'));
    assert.equal(otherSnapshot.lease.tools.includes('genos_replay'), false, 'a different snapshot remains outside the lease');
    assert.equal(await bridge.scopedReplayAuthorized(context('worker-a', 'snap-other-worker').db,
      context('worker-a', 'snap-other-worker').request, context('worker-a', 'snap-other-worker').binding), false);
    const otherWorker = await bridge.permissionInput(context('worker-b', ownedSnapshot));
    assert.equal(otherWorker.lease.tools.includes('genos_replay'), false, 'a different worker cannot borrow the capsule lease');
    assert.equal(directToolLeaseAllows('genos_replay'), false, 'the global direct lease remains denied');
    const registry = require('../src/services/mcpToolRegistry');
    const validation = { registry, toolName: 'genos_replay', args: { snapshot: 'snap-a' },
      executionKind: registry.detectExecutionKind('genos_replay'), scopedReplayAllowed: true };
    assert.equal(dispatch.scopedReplayLeaseAllowed(validation), true, 'the exact scoped flag passes local dispatch');
    assert.equal(toolLogic.revalidateToolCall('genos_replay', { snapshot: 'snap-a' }, true), null,
      'the transport revalidation accepts the scoped owner grant');
    assert.equal(toolLogic.revalidateToolCall('genos_replay', { snapshot: 'snap-a' }, false).code,
      'MCP_TOOL_LEASE_DENIED', 'the transport still denies replay without scoped proof');
    process.env.GENOS_MCP_DISABLED_TOOLS = 'genos_replay';
    assert.equal(dispatch.scopedReplayLeaseAllowed(validation), false, 'disabled replay cannot use the scoped grant');
    delete process.env.GENOS_MCP_DISABLED_TOOLS;
    process.stdout.write('Worker replay lease crosses local validation only for its own enabled evidence capsule: PASS\n');
  } finally {
    if (previousLease === undefined) delete process.env.GENOS_MCP_LEASE;
    else process.env.GENOS_MCP_LEASE = previousLease;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
