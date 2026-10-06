'use strict';

const bounded = require('./boundedOperationService');

const KINDS = Object.freeze({ agent: 'AGENT', daemon: 'DAEMON', tool: 'TOOL', service: 'EXTERNAL_SERVICE', human: 'HUMAN_GATEWAY', runtime: 'PROCEDURE' });
const ACTIONS = Object.freeze({ agent: ['SPAWN_WORKER', 'REUSE'], daemon: ['WAKE_DORMANT', 'REUSE'],
  tool: ['ATTACH_SERVICE', 'REUSE'], service: ['ATTACH_SERVICE', 'REUSE'],
  human: ['ATTACH_SERVICE', 'REUSE'], runtime: ['ADAPT_PROCEDURE', 'REUSE'] });

function requireRegistration(entry) {
  if (!KINDS[entry.kind] || typeof entry.providerId !== 'string' || !entry.providerId.trim()
    || !Array.isArray(entry.capabilities) || !entry.capabilities.length) {
    throw Object.assign(new Error('Typed provider identity and capabilities are required.'), { code: 'RHIZOME_PROVIDER_REGISTRATION_INVALID' });
  }
  if (!['start', 'execute', 'probe', 'stop'].every(name => typeof entry[name] === 'function')) {
    throw Object.assign(new Error('Providers require concrete start, execute, probe and stop operations.'), { code: 'RHIZOME_PROVIDER_LIFECYCLE_REQUIRED' });
  }
}

function create(entries = []) {
  return entries.map(entry => {
    requireRegistration(entry);
    return { ...entry, reference: entry.reference || entry.providerId, growthActions: entry.growthActions || ACTIONS[entry.kind],
      instantiate: async context => instantiate(entry, context),
      dispose: async context => bounded.run(entry.stop, { instanceId: context.node.localContext.instanceId }) };
  });
}

async function instantiate(entry, context) {
  const started = await entry.start(context);
  if (!started || typeof started.instanceId !== 'string' || !started.instanceId.trim()) return null;
  let accepted = false;
  try {
    const availability = await entry.probe({ ...context, instanceId: started.instanceId });
    if (context.signal?.aborted || availability?.status !== 'AVAILABLE'
      || !Array.isArray(availability.evidenceRefs) || !availability.evidenceRefs.length) return null;
    accepted = true;
    return buildNode({ entry, started, availability });
  } finally {
    if (!accepted) await bounded.run(entry.stop, { instanceId: started.instanceId });
  }
}

function buildNode({ entry, started, availability }) {
  return { node: { nodeId: started.nodeId || started.instanceId, kind: KINDS[entry.kind],
    capabilities: entry.capabilities, evidenceRequirements: entry.evidenceRequirements || [],
    reliability: availability.reliability ?? 0, cost: entry.cost || 0,
    localContext: { ...(entry.localContext || {}), instanceId: started.instanceId },
    provenance: availability.evidenceRefs }, edges: started.edges || [] };
}

module.exports = { create, KINDS, ACTIONS };
