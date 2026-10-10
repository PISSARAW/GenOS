function topology(nodes, edges) {
  const incoming = new Map(nodes.map(item => [item.id, 0]));
  const outgoing = new Map(nodes.map(item => [item.id, []]));
  for (const edge of edges) {
    if (!incoming.has(edge.source) || !incoming.has(edge.target)) continue;
    incoming.set(edge.target, incoming.get(edge.target) + 1);
    outgoing.get(edge.source).push(edge.target);
  }
  return { incoming, outgoing };
}

function depths(nodes, edges) {
  const { incoming, outgoing } = topology(nodes, edges);
  const queue = nodes.filter(item => incoming.get(item.id) === 0).map(item => item.id);
  const result = new Map(nodes.map(item => [item.id, 0]));
  let visited = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    visited += 1;
    for (const target of outgoing.get(id)) {
      result.set(target, Math.max(result.get(target), result.get(id) + 1));
      incoming.set(target, incoming.get(target) - 1);
      if (incoming.get(target) === 0) queue.push(target);
    }
  }
  if (visited !== nodes.length) return new Map(nodes.map((item, index) => [item.id, index % 3]));
  return result;
}

export function layoutWorkflow(graph) {
  const nodes = graph.nodes.slice(0, 100);
  const levels = depths(nodes, graph.edges);
  const rows = new Map();
  const points = new Map();
  let width = 320;
  let height = 240;
  for (const item of nodes) {
    const column = levels.get(item.id);
    const row = rows.get(column) || 0;
    const point = { x: 32 + column * 264, y: 40 + row * 136 };
    points.set(item.id, point);
    rows.set(column, row + 1);
    width = Math.max(width, point.x + 236);
    height = Math.max(height, point.y + 140);
  }
  return { points, width, height };
}
