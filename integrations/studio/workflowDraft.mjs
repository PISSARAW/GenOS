export function initialGraph() {
  return { nodes: [{ id: 'input', type: 'input', data: { label: 'Entrée' } },
    { id: 'output', type: 'output', data: { label: 'Sortie' } }], edges: [{ source: 'input', target: 'output' }] };
}

export function workflowWrite(value, loaded, workspaceId) {
  if (!loaded) return { ...value, workspaceId };
  if (loaded.status !== 'published') return { ...value, expectedVersion: loaded.version };
  const changed = ['name', 'description', 'graph', 'metadata'].some(key =>
    JSON.stringify(value[key]) !== JSON.stringify(loaded[key] ?? ''));
  if (changed) throw new Error('Version publiée immuable : créez un nouveau workflow pour modifier son contenu.');
  return { status: value.status, expectedVersion: loaded.version };
}

export function draftUnchanged(sent, current, inspectorPending) {
  return sent === current && !inspectorPending;
}

export function parseGraph(text) {
  const graph = JSON.parse(text);
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error('Le graphe doit contenir les listes nodes et edges.');
  const ids = graph.nodes.map(item => item?.id);
  if (ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) {
    throw new Error('Chaque nœud doit avoir un identifiant unique non vide.');
  }
  return graph;
}

export function insertNode(graph, kind) {
  if (graph.nodes.length >= 100) throw new Error('L’éditeur visuel est limité à 100 nœuds.');
  const next = structuredClone(graph);
  let index = 1;
  while (next.nodes.some(item => item.id === kind + '-' + index)) index += 1;
  next.nodes.push({ id: kind + '-' + index, type: kind, data: { label: kind + ' ' + index } });
  return next;
}

export function replaceNode(graph, id, patch) {
  if (!patch.id?.trim()) throw new Error('L’identifiant du nœud est requis.');
  if (graph.nodes.some(item => item.id === patch.id && item.id !== id)) throw new Error('Identifiant de nœud déjà utilisé.');
  const next = structuredClone(graph);
  next.nodes = next.nodes.map(item => item.id === id ? { ...item, ...patch,
    data: { ...item.data, ...patch.data } } : item);
  next.edges = next.edges.map(item => ({ ...item, source: item.source === id ? patch.id : item.source,
    target: item.target === id ? patch.id : item.target }));
  return next;
}

export function removeNode(graph, id) {
  const next = structuredClone(graph);
  next.nodes = next.nodes.filter(item => item.id !== id);
  next.edges = next.edges.filter(item => item.source !== id && item.target !== id);
  return next;
}

export function connectNodes(graph, edge) {
  if (!graph.nodes.some(item => item.id === edge.source) || !graph.nodes.some(item => item.id === edge.target)) {
    throw new Error('Choisissez deux nœuds présents dans le graphe.');
  }
  if (edge.source === edge.target) throw new Error('Un nœud ne peut pas être relié à lui-même.');
  if (graph.edges.some(item => item.source === edge.source && item.target === edge.target)) throw new Error('Ce lien existe déjà.');
  const next = structuredClone(graph);
  next.edges.push({ ...edge });
  return next;
}

export function removeEdge(graph, index) {
  const next = structuredClone(graph);
  next.edges.splice(index, 1);
  return next;
}

export function changeSummary(before, after) {
  const prior = new Map((before?.nodes || []).map(item => [item.id, item]));
  const current = new Map(after.nodes.map(item => [item.id, item]));
  return { added: [...current.keys()].filter(id => !prior.has(id)),
    removed: [...prior.keys()].filter(id => !current.has(id)),
    modified: [...current.keys()].filter(id => prior.has(id) && JSON.stringify(prior.get(id)) !== JSON.stringify(current.get(id))),
    linksChanged: JSON.stringify(before?.edges || []) !== JSON.stringify(after.edges) };
}
