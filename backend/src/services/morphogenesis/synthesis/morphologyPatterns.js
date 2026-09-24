'use strict';

function topology(topologyId, scope, children = []) {
  return { kind: 'TOPOLOGY', topology: topologyId, scope, children };
}

function composition(kind, children, properties = {}) {
  return { kind, ...properties, children };
}

const MORPHOLOGY_PATTERNS = Object.freeze([
  { id: 'DiscoveryToDelivery', description: 'Relie l’exploration distribuée à une équipe de livraison.', tags: ['discovery', 'delivery', 'adapter'], priorWeight: 0.7,
    pattern: composition('BRIDGE', [topology('rhizome', 'discovery'), topology('a_team', 'delivery')], { adapter: 'topology-output' }) },
  { id: 'ExperimentalEngineering', description: 'Ajoute une comparaison Trinity à un sous-système contesté.', tags: ['engineering', 'disputed', 'evidence'], priorWeight: 0.65,
    pattern: topology('a_team', 'engineering', [topology('trinity', 'disputed subsystem')]) },
  { id: 'IndependentEngineeringWorlds', description: 'Compare des branches A-Team dans des chambres Trinity indépendantes.', tags: ['engineering', 'independence', 'comparison'], priorWeight: 0.6,
    pattern: topology('trinity', 'independent worlds', [topology('a_team', 'world-a'), topology('a_team', 'world-b'), topology('a_team', 'world-c')]) },
  { id: 'TightlyCoupledDelivery', description: 'Associe une livraison A-Team à des sous-systèmes Syncytium couplés.', tags: ['delivery', 'shared-state', 'coordination'], priorWeight: 0.55,
    pattern: topology('a_team', 'delivery', [topology('syncytium', 'subsystem-a'), topology('syncytium', 'subsystem-b')]) },
  { id: 'EvidenceCouncil', description: 'Combine délibération Biocénose et comparaison Trinity.', tags: ['evidence', 'judgment', 'comparison'], priorWeight: 0.5,
    pattern: composition('PARALLEL', [topology('biocenose', 'council'), topology('trinity', 'experiments')]) },
  { id: 'FederatedSharedState', description: 'Fédère des demes Metapopulation avec un Syncytium local par deme.', tags: ['federation', 'shared-state', 'isolation'], priorWeight: 0.45,
    pattern: topology('metapopulation', 'federated', [topology('syncytium', 'deme-a'), topology('syncytium', 'deme-b'), topology('syncytium', 'deme-c')]) },
  { id: 'PersistentHost', description: 'Associe un hôte Holobionte à plusieurs symbiontes spécialisés.', tags: ['persistent', 'host', 'specialists'], priorWeight: 0.4,
    pattern: topology('holobionte', 'host', [topology('rhizome', 'research'), topology('biocenose', 'security'), topology('a_team', 'delivery'), topology('trinity', 'math')]) }
]);

module.exports = { MORPHOLOGY_PATTERNS, composition, topology };
