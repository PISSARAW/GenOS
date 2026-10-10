'use strict';

const assert = require('node:assert/strict');
const service = require('../src/services/topologySnapshotService');
const variants = require('../src/services/rhizome/variants/variantPolicyService');

service.registerAdapter('rhizome', require('../src/services/topologySnapshots/rhizome'));

const state = { rhizomeId: 'rhizome-1', missionId: 'mission-1', variant: 'routing',
  variantSelection: { variant: 'routing' }, graphVersion: 1, status: 'DORMANT', scope: 'mission',
  leases: [], budgets: { total: 3 }, routeLineage: [], routeResults: [], activeNeeds: [],
  openGaps: [], growthLimits: {}, repairScars: [], trails: [], oscillators: [] };
const node = { nodeId: 'node-1', capabilities: ['secret-capability'], providers: [] };
const edge = { edgeId: 'edge-1', from: 'node-1', to: 'node-1' };
const persisted = { revision: 1, participant: true, graphVersion: 1, workspace: true,
  eventRevision: 1 };
const db = {
  get: async (sql) => {
    if (sql.includes('FROM agents')) return { workspace_id: 'workspace-1' };
    if (sql.includes('FROM workspaces')) return persisted.workspace ? { id: 'workspace-1' } : null;
    if (sql.includes('FROM topology_sessions')) {
      return { state_json: JSON.stringify(state), revision: persisted.revision };
    }
    if (sql.includes('FROM mission_agents')) return persisted.participant ? { agent_id: 'agent-1' } : null;
    throw new Error(`Unexpected query: ${sql}`);
  },
  all: async (sql) => {
    if (sql.includes('FROM rhizome_nodes')) return [{ node_id: node.nodeId,
      graph_version: persisted.graphVersion, node_json: JSON.stringify(node) }];
    if (sql.includes('FROM rhizome_edges')) return [{ edge_id: edge.edgeId,
      graph_version: persisted.graphVersion, edge_json: JSON.stringify(edge) }];
    if (sql.includes('FROM topology_session_events')) return [{ revision: persisted.eventRevision,
      event_type: 'SESSION_CREATED', payload_json: '{}' }];
    throw new Error(`Unexpected query: ${sql}`);
  }
};
const context = { db, topologyId: 'rhizome', variantId: 'routing', sessionId: 'rhizome-1',
  agentId: 'agent-1', workspaceId: 'workspace-1',
  scope: { clause: 'w.organization_id = ? AND w.project_id = ?', params: ['org-1', 'project-1'] } };

async function refused(work, code) {
  await assert.rejects(work, (error) => error.code === code);
}

async function run() {
  for (const variant of variants.list()) {
    state.variant = variant;
    state.variantSelection.variant = variant;
    const request = { ...context, variantId: variant };
    const manifest = await service.capture(request);
    assert.equal(manifest.components.find((item) => item.id === 'variant-policy').payload.variant, variant);
    assert.equal(manifest.components.find((item) => item.id === 'graph').status, 'reference-only');
    assert.equal(JSON.stringify(manifest).includes('secret-capability'), false);
    const ready = await service.preflightRestore({ ...request, manifest });
    assert.equal(ready.allowed, true);
    assert.equal(ready.restorable, false);
    assert.equal(ready.adapterPlan.type, 'verify-only');
  }
  state.variant = 'routing';
  state.variantSelection.variant = 'routing';
  const manifest = await service.capture(context);
  state.budgets.total = 4;
  await refused(() => service.preflightRestore({ ...context, manifest }), 'TOPOLOGY_SNAPSHOT_DRIFT');
  state.budgets.total = 3;
  persisted.graphVersion = 2;
  await refused(() => service.capture(context), 'RHIZOME_SNAPSHOT_GRAPH_CONFLICT');
  persisted.graphVersion = 1;
  persisted.eventRevision = 2;
  await refused(() => service.capture(context), 'RHIZOME_SNAPSHOT_JOURNAL_GAP');
  persisted.eventRevision = 1;
  persisted.participant = false;
  await refused(() => service.capture(context), 'RHIZOME_SNAPSHOT_OWNER_MISMATCH');
  persisted.participant = true;
  persisted.workspace = false;
  await refused(() => service.capture(context), 'RHIZOME_SNAPSHOT_OWNER_MISMATCH');
  persisted.workspace = true;
  state.status = 'ACTIVE';
  const active = await service.capture(context);
  await refused(() => service.preflightRestore({ ...context, manifest: active }),
    'TOPOLOGY_SNAPSHOT_PREFLIGHT_REFUSED');
  state.status = 'DORMANT';
  state.leases = [{ leaseId: 'lease-1', expiresAt: '2999-01-01T00:00:00.000Z' }];
  const leased = await service.capture(context);
  await refused(() => service.preflightRestore({ ...context, manifest: leased }),
    'TOPOLOGY_SNAPSHOT_PREFLIGHT_REFUSED');
  console.log('Rhizome topology snapshots: pass');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
