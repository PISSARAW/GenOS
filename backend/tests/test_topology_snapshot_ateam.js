'use strict';

const assert = require('node:assert/strict');
const service = require('../src/services/topologySnapshotService');
const runStore = require('../src/services/aTeam/teamRunStore');
const graphStore = require('../src/services/aTeam/workGraph/workGraphStore');
const { VARIANTS } = require('../src/services/aTeam/variants/variantRegistry');

service.registerAdapter('a_team', require('../src/services/topologySnapshots/aTeam'));

const scope = { clause: 'w.organization_id = ? AND w.project_id = ?', params: ['org-1', 'project-1'] };
const context = { db: null, scope, topologyId: 'a_team', variantId: 'pipeline',
  sessionId: 'team-1', agentId: 'agent-1', workspaceId: 'workspace-1' };
const members = [{ memberId: 'a', agentId: 'worker-a', workerId: 'worker-a', expertise: ['analysis'],
  ownedResponsibilities: ['design'], consults: [], authority: {}, toolLease: [] }];
const run = { teamRunId: 'team-1', missionId: 'agent-1', workGraphId: 'graph-1',
  status: 'COMPLETED', phase: 'DEBRIEF', revision: 2, members,
  execution: { runnerLease: null, deadlineAt: '2026-10-10T12:00:00Z',
    organizationPolicy: { variant: 'pipeline' } } };
const graph = { workGraphId: 'graph-1', teamRunId: 'team-1', revision: 3,
  nodes: [{ nodeId: 'node-1', status: 'SUCCEEDED' }],
  edges: [{ fromNode: 'node-1', toNode: 'node-2', handoff: { evidenceRefs: ['proof-1'] } }],
  layers: [['node-1']], memberStages: { a: 0 }, nodeStages: { 'node-1': 0 } };
const agent = { id: 'agent-1', workspace_id: 'workspace-1', status: 'completed' };
const workspace = { id: 'workspace-1', organization_id: 'org-1', project_id: 'project-1' };

async function expectRefusal(work, code) {
  await assert.rejects(work, (error) => error.code === code);
}

async function runTests() {
  const oldRunLoad = runStore.load;
  const oldGraphLoad = graphStore.load;
  runStore.load = async () => structuredClone(run);
  graphStore.load = async () => structuredClone(graph);
  context.db = { get: async (sql) => sql.includes('FROM agents') ? agent : workspace };
  try {
    for (const variant of Object.keys(VARIANTS)) {
      run.execution.organizationPolicy.variant = variant;
      const request = { ...context, variantId: variant };
      const manifest = await service.capture(request);
      assert.equal(manifest.components.find((item) => item.id === 'variant-policy').payload.variant, variant);
      assert.equal(manifest.components.find((item) => item.id === 'work-graph').reference.handoffs.length, 1);
      if (variant === 'pipeline') {
        assert.deepEqual(manifest.components.find((item) => item.id === 'variant-policy').payload.completedNodes, ['node-1']);
      }
      const ready = await service.preflightRestore({ ...request, manifest });
      assert.equal(ready.allowed, true);
      assert.equal(ready.restorable, false);
    }
    run.execution.organizationPolicy.variant = 'pipeline';
    const manifest = await service.capture(context);
    run.revision++;
    await expectRefusal(() => service.preflightRestore({ ...context, manifest }), 'TOPOLOGY_SNAPSHOT_DRIFT');
    run.revision--;
    workspace.project_id = 'other-project';
    await expectRefusal(() => service.capture(context), 'ATEAM_SNAPSHOT_OWNER_MISMATCH');
    workspace.project_id = 'project-1';
    run.status = 'RUNNING';
    const active = await service.capture(context);
    await expectRefusal(() => service.preflightRestore({ ...context, manifest: active }),
      'TOPOLOGY_SNAPSHOT_PREFLIGHT_REFUSED');
    run.status = 'COMPLETED';
    run.execution.runnerLease = { token: 'secret', ownerId: 'owner', expiresAt: '2026-10-11T12:00:00Z' };
    const leased = await service.capture(context);
    assert.equal(JSON.stringify(leased).includes('secret'), false);
    await expectRefusal(() => service.preflightRestore({ ...context, manifest: leased }),
      'TOPOLOGY_SNAPSHOT_PREFLIGHT_REFUSED');
  } finally {
    runStore.load = oldRunLoad;
    graphStore.load = oldGraphLoad;
  }
  console.log('A-Team topology snapshots: pass');
}

runTests().catch((error) => { console.error(error); process.exitCode = 1; });
