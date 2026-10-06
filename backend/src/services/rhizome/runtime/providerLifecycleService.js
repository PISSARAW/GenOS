'use strict';

const rhizome = require('../../rhizomeCoordinationService');
const bounded = require('./boundedOperationService');

async function close(input) {
  const graph = await rhizome.graphSnapshot(input.sessionId, input.options);
  const released = [];
  const failed = [];
  for (const node of graph.nodes) {
    const provider = input.providers.find(item => node.providers.some(binding => binding.providerId === item.providerId));
    if (typeof provider?.dispose !== 'function' || !node.localContext?.instanceId) continue;
    try {
      await bounded.run(provider.dispose, { node }, input.timeoutMs);
      released.push(node.nodeId);
    } catch (error) { failed.push({ nodeId: node.nodeId, reason: error.code || error.message }); }
  }
  if (failed.length) return { closed: false, released, failed };
  await rhizome.closeSession(input.sessionId, input.options);
  return { closed: true, released, failed };
}

module.exports = { close };
