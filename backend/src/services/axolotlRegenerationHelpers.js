'use strict';

/**
 * @file axolotlRegenerationHelpers.js
 * @description Fonctions internes pour axolotlRegenerationService.js
 *
 * Extraction de sous-fonctions pour respecter CC <= 10 par fonction.
 */

/**
 * Comparer la topologie actuelle avec les alternatives connues.
 */
function compareTopologyAlternatives(currentTopology) {
  if (!currentTopology) return [];
  const currentKey = topologySignature(currentTopology);
  const candidates = buildCandidateAlternatives(currentKey);
  return filterBySuitability(candidates);
}

/**
 * Construire la liste des alternatives candidates.
 */
function buildCandidateAlternatives(currentKey) {
  return [
    makeAlternative(
      'decentralized_rhizome',
      'decentralized',
      'Topologie décentralisée en réseau rhizomique',
      'centralisé → rhizomique',
      currentKey.includes('centralized') ? 'high' : 'medium'
    ),
    makeAlternative(
      'modular_hierarchical',
      'modular_hierarchical',
      'Topologie hiérarchique modulaire avec frontières explicites',
      'plate → hiérarchique modulaire',
      'medium'
    ),
    makeAlternative(
      'functional_layers',
      'functional_layers',
      'Organisation en couches fonctionnelles (sensory, processing, effector)',
      'par rôle → par fonction',
      'high'
    )
  ];
}

/**
 * Créer une alternative candidate.
 */
function makeAlternative({ id, signature, description, structuralDiff, suitability }) {
  return { id, signature, description, structuralDifference: structuralDiff, suitability };
}

/**
 * Filtrer par pertinence (éliminer les low).
 */
function filterBySuitability(alternatives) {
  return alternatives.filter(a => a.suitability !== 'low');
}

/**
 * Signature unique d'une topologie.
 */
function topologySignature(topology) {
  if (!topology) return 'unknown';
  return joinFields(topology.structure, topology.mode, topology.organization);
}

/**
 * Joindre les champs non-nuls avec un séparateur.
 */
function joinFields(...fields) {
  const present = fields.filter(Boolean);
  return present.length ? present.join('_') : 'empty';
}

/**
 * Sélectionner la structure cible pour la régénération.
 */
function selectTargetStructure(currentTopology, alternatives) {
  const currentSig = topologySignature(currentTopology);
  const highSuitability = pickBySuitability(alternatives, 'high');
  if (highSuitability.length) return highSuitability[0];
  if (alternatives.length) return alternatives[0];
  return fallbackTarget(currentSig);
}

/**
 * Extraire les alternatives à haute pertinence.
 */
function pickBySuitability(alternatives, suitability) {
  return alternatives.filter(a => a.suitability === suitability);
}

/**
 * Cible par défaut quand aucune alternative n'est disponible.
 */
function fallbackTarget(currentSig) {
  return {
    id: 'functional_generic',
    signature: 'functional_generic',
    description: 'Topologie fonctionnelle générique post-régénération',
    structuralDifference: currentSig !== 'unknown' ? 'anything → functional_generic' : 'none → functional_generic'
  };
}

/**
 * Construire le chemin de régénération.
 */
function buildRegenerationPath(currentTopology, target, preserved) {
  const steps = [];
  if (preserved && preserved.length) {
    steps.push(makePreserveStep(preserved));
  }
  steps.push(makeBuildStep(target));
  if (preserved && preserved.length) {
    steps.push(makeReconnectStep());
  }
  steps.push(makeValidateStep());
  return steps;
}

function makePreserveStep(preserved) {
  return { phase: 'preserve', action: 'Préserver état critique', items: preserved, order: 1 };
}

function makeBuildStep(target) {
  return { phase: 'build', action: `Construire topologie ${target.signature}`, target: target.id, order: 2 };
}

function makeReconnectStep() {
  return { phase: 'reconnect', action: 'Reconnecter composants conservés', order: 3 };
}

function makeValidateStep() {
  return { phase: 'validate', action: 'Valider équivalence fonctionnelle', order: 4 };
}

/**
 * Construire la nouvelle topologie cible.
 */
function buildTopologyComponents(targetStructure, preserved) {
  const builders = {
    decentralized_rhizome: buildDecentralizedRhizome,
    functional_layers: buildFunctionalLayers,
    modular_hierarchical: buildModularHierarchical,
    functional_generic: buildFunctionalGeneric
  };
  const builder = builders[targetStructure.id] || builders.functional_generic;
  return builder(targetStructure, preserved);
}

function buildDecentralizedRhizome(target, preserved) {
  const hasGenome = preserved.some(p => p.kind === 'genome');
  return {
    components: [
      { id: 'node_a', role: 'entry_point', preserved: false },
      { id: 'node_b', role: 'coordination', preserved: hasGenome },
      { id: 'node_c', role: 'execution', preserved: false },
      { id: 'node_d', role: 'memory', preserved: hasGenome }
    ],
    connections: [
      { from: 'node_a', to: 'node_b', type: 'route' },
      { from: 'node_a', to: 'node_c', type: 'route' },
      { from: 'node_b', to: 'node_d', type: 'route' },
      { from: 'node_c', to: 'node_d', type: 'route' }
    ]
  };
}

function buildFunctionalLayers(target, preserved) {
  return {
    components: [
      { id: 'layer_sensory', role: 'sensory_input', preserved: false },
      { id: 'layer_processing', role: 'processing', preserved: preserved.length > 0 },
      { id: 'layer_effective', role: 'effector', preserved: false }
    ],
    connections: [
      { from: 'layer_sensory', to: 'layer_processing', type: 'feedforward' },
      { from: 'layer_processing', to: 'layer_effective', type: 'feedforward' },
      { from: 'layer_effective', to: 'layer_sensory', type: 'feedback' }
    ]
  };
}

function buildModularHierarchical(target, preserved) {
  return buildDecentralizedRhizome(target, preserved);
}

function buildFunctionalGeneric(target, preserved) {
  return {
    components: [{ id: 'component_1', role: 'primary', preserved: preserved.length > 0 }],
    connections: []
  };
}

/**
 * Vérifier la connexité du réseau (BFS).
 */
function checkConnectivity(topology) {
  const comps = topology.components;
  const conns = topology.connections || [];
  if (!comps || comps.length === 0) return false;
  const adjacency = buildAdjacency(comps, conns);
  const visited = bfsVisit(adjacency, comps[0].id);
  return visited.size === comps.length;
}

function buildAdjacency(comps, conns) {
  const adjacency = new Map();
  for (const c of comps) adjacency.set(c.id, new Set());
  for (const conn of conns) {
    const a = adjacency.get(conn.from);
    const b = adjacency.get(conn.to);
    if (a) a.add(conn.to);
    if (b) b.add(conn.from);
  }
  return adjacency;
}

function bfsVisit(adjacency, startId) {
  const visited = new Set();
  const queue = [startId];
  while (queue.length) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    const neighbors = adjacency.get(current);
    if (neighbors) for (const n of neighbors) if (!visited.has(n)) queue.push(n);
  }
  return visited;
}

module.exports = {
  compareTopologyAlternatives,
  topologySignature,
  selectTargetStructure,
  buildRegenerationPath,
  buildTopologyComponents,
  checkConnectivity
};
