'use strict';

function receptorMatches(node, ligand) {
  const receptors = node.localContext?.receptors || [];
  return receptors.some((receptor) => {
    const capability = typeof receptor === 'string' ? receptor : receptor.capability;
    const scopes = typeof receptor === 'string' ? ['mission', 'workspace', 'persistent'] : receptor.scopes || [];
    return capability === ligand.capability && scopes.includes(ligand.scope);
  });
}

function recipients(session, ligand) {
  return (session.nodes || []).filter((node) => ['ACTIVE', 'AVAILABLE'].includes(node.state)
    && node.availability?.status !== 'UNAVAILABLE' && receptorMatches(node, ligand))
    .map((node) => node.nodeId).sort();
}

module.exports = { recipients, receptorMatches };
