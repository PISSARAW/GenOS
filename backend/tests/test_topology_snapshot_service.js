'use strict';

const assert = require('node:assert/strict');
const service = require('../src/services/topologySnapshotService');
const contract = require('../src/services/topologySnapshotContract');

const state = { revision: 4, value: 'sealed' };
const context = { db: {}, scope: { clause: 'organization_id = ?', params: ['tenant-1'] },
  topologyId: 'test_topology', variantId: 'controlled', sessionId: 'session-1',
  agentId: 'agent-1', workspaceId: 'workspace-1', workerKind: 'bounded_worker' };

service.registerAdapter('test_topology', {
  async capture() {
    return { policyVersion: 1, boundary: { revision: state.revision }, components: [
      { id: 'state', status: 'captured', payload: { value: state.value } },
      { id: 'external', status: 'reference-only', reference: { revision: state.revision } }
    ] };
  },
  async preflightRestore() { return { ok: true, plan: { checked: true } }; }
});

async function expectRefusal(action, code) {
  await assert.rejects(action, (error) => error.code === code);
}

async function run() {
  const manifest = await service.capture(context);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.components[0].status, 'captured');
  const ready = await service.preflightRestore({ ...context, manifest });
  assert.equal(ready.allowed, true);
  assert.equal(ready.restorable, false);
  assert.equal(ready.plan.type, 'verify-only');

  await expectRefusal(() => service.preflightRestore({ ...context, agentId: 'other', manifest }),
    'TOPOLOGY_SNAPSHOT_OWNER_MISMATCH');
  const tampered = structuredClone(manifest);
  tampered.components[0].payload.value = 'forged';
  await expectRefusal(() => service.preflightRestore({ ...context, manifest: tampered }),
    'TOPOLOGY_SNAPSHOT_INTEGRITY_FAILED');
  const forgedAuthority = { ...manifest, restorable: true, commitAuthorized: true };
  await expectRefusal(() => service.preflightRestore({ ...context, manifest: forgedAuthority }),
    'TOPOLOGY_SNAPSHOT_INTEGRITY_FAILED');
  const hiddenAuthority = { ...manifest };
  Object.defineProperty(hiddenAuthority, 'restorable', { value: true });
  await expectRefusal(() => service.preflightRestore({ ...context, manifest: hiddenAuthority }),
    'TOPOLOGY_SNAPSHOT_INTEGRITY_FAILED');
  const symbolAuthority = { ...manifest, [Symbol('commitAuthorized')]: true };
  await expectRefusal(() => service.preflightRestore({ ...context, manifest: symbolAuthority }),
    'TOPOLOGY_SNAPSHOT_INTEGRITY_FAILED');
  const extraBinding = structuredClone(manifest);
  extraBinding.bindings.unsealed = 'authority';
  await expectRefusal(() => service.preflightRestore({ ...context, manifest: extraBinding }),
    'TOPOLOGY_SNAPSHOT_INTEGRITY_FAILED');
  await expectRefusal(() => service.capture({ ...context,
    scope: { clause: 'organization_id = ? OR 1=1', params: ['tenant-1'] } }),
  'TOPOLOGY_SNAPSHOT_SCOPE_INVALID');

  state.revision++;
  await expectRefusal(() => service.preflightRestore({ ...context, manifest }), 'TOPOLOGY_SNAPSHOT_DRIFT');
  state.revision--;
  const bad = contract.seal(context, { boundary: { revision: 4 }, components: [
    { id: 'missing', status: 'unsupported', reason: 'Adapter cannot capture it.' }
  ] });
  await expectRefusal(() => service.preflightRestore({ ...context, manifest: bad }),
    'TOPOLOGY_SNAPSHOT_UNAVAILABLE');
  await expectRefusal(() => service.capture({ ...context, topologyId: 'unknown' }),
    'TOPOLOGY_SNAPSHOT_ADAPTER_MISSING');
  console.log('topology snapshot service: pass');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
