'use strict';

const { normalizeCapabilityLigand } = require('../contracts/capabilityLigand');
const receptorRegistry = require('./receptorRegistry');

function publish(session, value) {
  const ligand = normalizeCapabilityLigand(value);
  const source = (session.nodes || []).find((node) => node.nodeId === ligand.sourceNodeId);
  const evidenceOwned = source && ligand.evidenceRefs.every((reference) => source.provenance.includes(reference));
  if (!source || !source.capabilities.includes(ligand.capability) || !evidenceOwned) {
    throw Object.assign(new Error('Capability ligand is not supported by its source node.'), { code: 'RHIZOME_SIGNAL_REJECTED' });
  }
  return { ...ligand, recipientNodeIds: receptorRegistry.recipients(session, ligand) };
}

module.exports = { publish };
