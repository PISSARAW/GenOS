import { node } from './ui.mjs';
const namespace = 'http://www.w3.org/2000/svg';

function svgElement(tag, attributes, text = '') {
  const element = document.createElementNS(namespace, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  element.textContent = text;
  return element;
}

function positions(nodes) {
  return new Map(nodes.slice(0, 100).map((item, index) => [item.id,
    { x: 24 + (index % 3) * 230, y: 24 + Math.floor(index / 3) * 130 }]));
}

function drawEdge(svg, edge, points) {
  const source = points.get(edge.source);
  const target = points.get(edge.target);
  if (!source || !target) return;
  const x = source.x + 190;
  const y = source.y + 38;
  const path = `M ${x} ${y} C ${x + 35} ${y}, ${target.x - 35} ${target.y + 38}, ${target.x} ${target.y + 38}`;
  svg.append(svgElement('path', { d: path, class: 'workflow-edge', 'marker-end': 'url(#workflow-arrow)' }));
}

function drawNode(svg, item, context) {
  const point = context.points.get(item.id);
  const group = svgElement('g', { transform: `translate(${point.x} ${point.y})`, tabindex: 0, role: 'button',
    'aria-label': 'Configurer ' + (item.data?.label || item.id), 'aria-pressed': String(context.selected === item.id),
    'data-node-id': item.id, class: 'workflow-node' });
  group.append(svgElement('rect', { width: 190, height: 76, rx: 12 }),
    svgElement('text', { x: 14, y: 26 }, String(item.data?.label || item.id).slice(0, 24)),
    svgElement('text', { x: 14, y: 51, class: 'workflow-kind' }, item.kind || item.type || 'Nœud'));
  group.addEventListener('click', () => context.select(item.id));
  group.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    context.select(item.id);
  });
  svg.append(group);
}

export function renderCanvas(container, graph, options) {
  const height = Math.max(240, Math.ceil(Math.min(graph.nodes.length, 100) / 3) * 130 + 24);
  const svg = svgElement('svg', { viewBox: `0 0 714 ${height}`, width: 714, height,
    role: 'group', 'aria-label': 'Graphe éditable du workflow' });
  const defs = svgElement('defs', {});
  const marker = svgElement('marker', { id: 'workflow-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5,
    markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
  marker.append(svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 z' }));
  defs.append(marker);
  svg.append(defs);
  const points = positions(graph.nodes);
  graph.edges.forEach(edge => drawEdge(svg, edge, points));
  graph.nodes.slice(0, 100).forEach(item => drawNode(svg, item, { ...options, points }));
  container.replaceChildren(svg);
  if (graph.nodes.length > 100) container.append(node('p', '100 nœuds affichés ; le JSON conserve le graphe complet.'));
}
