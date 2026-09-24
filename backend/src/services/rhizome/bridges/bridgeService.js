'use strict';

const { normalizeBridge } = require('../contracts/bridgeContract');
const validationService = require('./bridgeValidationService');
const graphService = require('../graph/capabilityGraphService');

function endpoint(session, nodeId, capability) {
  const node = session.nodes.find((item) => item.nodeId === nodeId);
  return node && node.capabilities.includes(capability);
}

function bridgeNode(bridge, proof) {
  return {
    nodeId: `bridge:${bridge.bridgeId}`,
    kind: 'PROCEDURE',
    capabilities: [`bridge:${bridge.type.toLowerCase()}`],
    inputs: [bridge.sourceCapability],
    outputs: [bridge.targetCapability],
    state: 'ACTIVE',
    availability: { status: 'AVAILABLE' },
    localContext: { bridgeId: bridge.bridgeId, inputContract: bridge.inputContract, outputContract: bridge.outputContract, ephemeral: bridge.ephemeral },
    provenance: proof.evidenceRefs
  };
}

function integrate(input) {
  const bridge = normalizeBridge(input.bridge);
  const valid = validationService.validate({ ...input, bridge });
  if (!valid) throw Object.assign(new Error('Bridge proof is incomplete or untrusted.'), { code: 'RHIZOME_BRIDGE_REJECTED' });
  const { session } = input;
  if (!endpoint(session, bridge.fromNodeId, bridge.sourceCapability) || !endpoint(session, bridge.toNodeId, bridge.targetCapability)) {
    throw Object.assign(new Error('Bridge endpoints do not provide the declared capabilities.'), { code: 'RHIZOME_BRIDGE_REJECTED' });
  }
  let updated = graphService.addNode(session, bridgeNode(bridge, input.proof));
  updated = graphService.addEdge(updated, { edgeId: `bridge:${bridge.bridgeId}:in`, from: bridge.fromNodeId, to: `bridge:${bridge.bridgeId}`, relation: 'PROVIDES_INPUT' });
  updated = graphService.addEdge(updated, { edgeId: `bridge:${bridge.bridgeId}:out`, from: `bridge:${bridge.bridgeId}`, to: bridge.toNodeId, relation: 'TRANSLATES_TO' });
  return { ...updated, bridgeId: bridge.bridgeId, evidenceRefs: input.proof.evidenceRefs };
}

module.exports = { integrate };
