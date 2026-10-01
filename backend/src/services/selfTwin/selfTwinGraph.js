'use strict';

const COMPONENTS = Object.freeze([
  ['agow', 'AGOW', 'workspace de candidats et intégration cognitive'],
  ['active_query', 'Active Query', 'génération de questions actives'],
  ['predictive_regret', 'Regret prédictif', 'estimation des conséquences'],
  ['interoception', 'Interoception', 'mesures de viabilité'],
  ['candidate_pool', 'Candidate pool', 'priorisation des candidats'],
  ['signal_plane', 'Signal Plane', 'transport inter-agents'],
  ['procedural_memory', 'Mémoire procédurale', 'récupération des procédures'],
  ['mission_planning', 'Planification', 'décomposition des missions'],
  ['morphogenesis', 'Morphogenèse', 'propositions de changement structurel']
]);
const LINKS = Object.freeze([
  ['active_query', 'agow', 'feeds'], ['predictive_regret', 'agow', 'feeds'],
  ['interoception', 'agow', 'constrains'], ['agow', 'candidate_pool', 'feeds'],
  ['candidate_pool', 'mission_planning', 'informs'], ['signal_plane', 'mission_planning', 'transports'],
  ['procedural_memory', 'mission_planning', 'informs'], ['morphogenesis', 'agow', 'proposes']
]);

function manifest() {
  return {
    version: 1,
    nodes: COMPONENTS.map(([id, name, role]) => ({ id: `genos:${id}`, label: 'WorldGraphNode', properties: { name, role } })),
    edges: LINKS.map(([from, to, relation]) => ({ id: `${from}:${relation}:${to}`, source: `genos:${from}`, target: `genos:${to}`, label: 'WORLD_GRAPH_EDGE', properties: { relation, status: 'structural_hypothesis' } }))
  };
}

async function project(repository, graph = manifest()) {
  if (!repository || repository.constructor.name === 'SQLiteGraphRepository') return { projected: false, backend: 'sqlite-canonical-only' };
  for (const node of graph.nodes) await repository.upsertNode(node);
  for (const edge of graph.edges) await repository.upsertEdge(edge);
  return { projected: true, backend: 'ladybug' };
}

module.exports = { manifest, project };
