''use strict'';

/**
 * @file axolotlRegenerationHelpers.js
 * @description Fonctions internes pour axolotlRegenerationService.js
 */

/**
 * Comparer la topologie actuelle avec les alternatives connues.
 */
function compareTopologyAlternatives(currentTopology) {
  if (!currentTopology) return [];
  const currentKey = topologySignature(currentTopology);
  return [
    {
      id: ''decentralized_rhizome'',
      signature: ''decentralized'',
      description: ''Topologie décentralisée en réseau rhizomique'',
      structuralDifference: ''centralisé → rhizomique'',
      suitability: currentKey.includes(''centralized'') ? ''high'' : ''medium''
    },
    {
      id: ''modular_hierarchical'',
      signature: ''modular_hierarchical'',
      description: ''Topologie hiérarchique modulaire avec frontières explicites'',
      structuralDifference: ''plate → hiérarchique modulaire'',
      suitability: ''medium''
    },
    {
      id: ''functional_layers'',
      signature: ''functional_layers'',
      description: ''Organisation en couches fonctionnelles (sensory, processing, effector)'',
      structuralDifference: ''par rôle → par fonction'',
      suitability: ''high''
    }
  ].filter(a => a.suitability !== ''low'');
}

/**
 * Signature unique d''une topologie.
 */
function topologySignature(topology) {
  if (!topology) return ''unknown'';
  return [topology.structure, topology.mode, topology.organization]
    .filter(Boolean).join(''_'') || ''empty'';
}

/**
 * Sélectionner la structure cible pour la régénération.
 */
function selectTargetStructure(currentTopology, alternatives) {
  const currentSig = topologySignature(currentTopology);
  const compatible = alternatives.filter(a => a.suitability === ''high'');
  if (compatible.length) return compatible[0];
  if (alternatives.length) return alternatives[0];
  return {
    id: ''functional_generic'',
    signature: ''functional_generic'',
    description: ''Topologie fonctionnelle générique post-régénération'',
    structuralDifference: currentSig !== ''unknown'' ? `anything → functional_generic` : ''none → functional_generic''
  };
}

/**
 * Construire le chemin de régénération.
 */
function buildRegenerationPath(currentTopology, target, preserved) {
  const steps = [];
  if (preserved && preserved.length) {
    steps.push({ phase: ''preserve'', action: ''Préserver état critique'', items: preserved, order: 1 });
  }
  steps.push({ phase: ''build'', action: `Construire topologie ${target.signature}`, target: target.id, order: 2 });
  if (preserved && preserved.length) {
    steps.push({ phase: ''reconnect'', action: ''Reconnecter composants conservés'', order: 3 });
  }
  steps.push({ phase: ''validate'', action: ''Valider équivalence fonctionnelle'', order: 4 });
  return steps;
}

/**
 * Construire la nouvelle topologie cible.
 */
function buildTopologyComponents(targetStructure, preserved) {
  if (targetStructure.id === ''decentralized_rhizome'') {
    const hasGenome = preserved.some(p => p.kind === ''genome'');
    return {
      components: [
        { id: ''node_a'', role: ''entry_point'', preserved: false },
        { id: ''node_b'', role: ''coordination'', preserved: hasGenome },
        { id: ''node_c'', role: ''execution'', preserved: false },
        { id: ''node_d'', role: ''memory'', preserved: hasGenome }
      ],
      connections: [
        { from: ''node_a'', to: ''node_b'', type: ''route'' },
        { from: ''node_a'', to: ''node_c'', type: ''route'' },
        { from: ''node_b'', to: ''node_d'', type: ''route'' },
        { from: ''node_c'', to: ''node_d'', type: ''route'' }
      ]
    };
  }
  if (targetStructure.id === ''functional_layers'') {
    return {
      components: [
        { id: ''layer_sensory'', role: ''sensory_input'', preserved: false },
        { id: ''layer_processing'', role: ''processing'', preserved: preserved.length > 0 },
        { id: ''layer_effective'', role: ''effector'', preserved: false }
      ],
      connections: [
        { from: ''layer_sensory'', to: ''layer_processing'', type: ''feedforward'' },
        { from: ''layer_processing'', to: ''layer_effective'', type: ''feedforward'' },
        { from: ''layer_effective'', to: ''layer_sensory'', type: ''feedback'' }
      ]
    };
  }
  return { components: [{ id: ''component_1'', role: ''primary'', preserved: preserved.length > 0 }], connections: [] };
}

/**
 * Vérifier la connexité du réseau (BFS).
 */
function checkConnectivity(topology) {
  if (!topology.components || topology.components.length === 0) return false;
  const adjacency = new Map();
  for (const c of topology.components) adjacency.set(c.id, new Set());
  for (const conn of (topology.connections || [])) {
    const a = adjacency.get(conn.from);
    const b = adjacency.get(conn.to);
    if (a) a.add(conn.to);
    if (b) b.add(conn.from);
  }
  const visited = new Set();
  const queue = [topology.components[0].id];
  while (queue.length) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    const neighbors = adjacency.get(current);
    if (neighbors) for (const n of neighbors) if (!visited.has(n)) queue.push(n);
  }
  return visited.size === topology.components.length;
}

module.exports = {
  compareTopologyAlternatives,
  topologySignature,
  selectTargetStructure,
  buildRegenerationPath,
  buildTopologyComponents,
  checkConnectivity
};
