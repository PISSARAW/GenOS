'use strict';

const { objectValue, textValue, enumValue, listValue } = require('./validation');

function normalizeCapabilityLigand(value) {
  const ligand = objectValue(value, 'CapabilityLigand');
  const evidenceRefs = listValue(ligand.evidenceRefs, 'evidenceRefs');
  if (!evidenceRefs.length) throw Object.assign(new Error('Capability ligand requires evidence references.'), { code: 'RHIZOME_SIGNAL_EVIDENCE_REQUIRED' });
  return {
    signalId: textValue(ligand.signalId, 'signalId'),
    sourceNodeId: textValue(ligand.sourceNodeId, 'sourceNodeId'),
    capability: textValue(ligand.capability, 'capability'),
    evidenceRefs,
    scope: enumValue(ligand.scope, { allowed: ['mission', 'workspace', 'persistent'], field: 'scope', fallback: 'mission' })
  };
}

module.exports = { normalizeCapabilityLigand };
