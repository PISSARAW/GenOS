'use strict';
const crypto = require('node:crypto');
const store = require('./axolotlStateStore');
const kernel = require('./axolotlRuntimeKernel');
function resolve(topology, id) {
  return topology.components.find((node) => node.id === id || node.originId === id || node.regeneratedFrom === id);
}
async function send(input) {
  const active = await store.activeTopology(input.db, input.orchestratorId);
  if (!active) throw store.error('AXOLOTL_ACTIVE_TOPOLOGY_REQUIRED');
  const routed = kernel.route(active.topology, input);
  const from = resolve(active.topology, input.from);
  const to = resolve(active.topology, input.to);
  const message = { id: crypto.randomUUID(), orchestratorId: input.orchestratorId, workspaceId: active.workspaceId,
    topologyVersion: active.version, from: routed.from, to: routed.to,
    fromOrigin: from.originId || from.id, toOrigin: to.originId || to.id,
    payload: routed.payload, status: 'pending', createdAt: Date.now() };
  if (Buffer.byteLength(JSON.stringify(message.payload)) > 65536) throw store.error('AXOLOTL_MESSAGE_TOO_LARGE');
  return store.transaction(input.db, async (tx) => {
    const current = await store.activeTopology(tx, input.orchestratorId);
    if (current.version !== active.version) throw store.error('AXOLOTL_ROUTING_STALE');
    await store.write(tx, { kind: 'message', id: message.id, value: message });
    return { success: true, queued: true, messageId: message.id, to: message.to, topologyVersion: active.version };
  });
}
async function receive(input) {
  return store.transaction(input.db, async (tx) => {
    const active = await store.activeTopology(tx, input.orchestratorId);
    if (!active) throw store.error('AXOLOTL_ACTIVE_TOPOLOGY_REQUIRED');
    const node = resolve(active.topology, input.componentId);
    if (!node || node.status === 'failed') throw store.error('AXOLOTL_COMPONENT_NOT_AVAILABLE');
    const limit = input.limit ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw store.error('AXOLOTL_INBOX_LIMIT_INVALID');
    const rows = await tx.all(`SELECT payload_json FROM axolotl_state WHERE kind = 'message'
      AND json_extract(payload_json, '$.orchestratorId') = ?
      AND json_extract(payload_json, '$.workspaceId') = ?
      AND json_extract(payload_json, '$.toOrigin') = ?
      AND json_extract(payload_json, '$.status') = 'pending'
      ORDER BY json_extract(payload_json, '$.createdAt'), id LIMIT ?`,
      input.orchestratorId, active.workspaceId, node.originId || node.id, limit);
    const messages = rows.map((row) => JSON.parse(row.payload_json));
    for (const message of messages) await store.write(tx, { kind: 'message', id: message.id, expectedVersion: message.version,
      value: { ...message, status: 'consumed', consumedAt: Date.now(), consumedBy: node.id } });
    return { success: true, componentId: node.id, messages };
  });
}
module.exports = { send, receive };