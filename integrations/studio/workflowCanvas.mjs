import { node } from './ui.mjs';
import { layoutWorkflow } from './workflowLayout.mjs';
const namespace = 'http://www.w3.org/2000/svg';

function svgElement(tag, attributes, text = '') {
  const element = document.createElementNS(namespace, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  element.textContent = text;
  return element;
}

function drawEdge(svg, edge, points) {
  const source = points.get(edge.source);
  const target = points.get(edge.target);
  if (!source || !target) return;
  const x = source.x + 204;
  const y = source.y + 50;
  const path = `M ${x} ${y} C ${x + 35} ${y}, ${target.x - 35} ${target.y + 50}, ${target.x} ${target.y + 50}`;
  svg.append(svgElement('path', { d: path, class: 'workflow-edge', 'marker-end': 'url(#workflow-arrow)' }));
}

function drawNode(svg, item, context) {
  const point = context.points.get(item.id);
  const kind = String(item.kind || item.type || 'Nœud');
  const group = svgElement('g', { transform: `translate(${point.x} ${point.y})`, tabindex: 0, role: 'button',
    'aria-label': 'Configurer ' + (item.data?.label || item.id), 'aria-pressed': String(context.selected === item.id),
    'data-node-id': item.id, 'data-kind': kind, class: 'workflow-node' });
  group.append(svgElement('title', {}, `${item.data?.label || item.id} · ${kind} · ${item.id}`),
    svgElement('rect', { width: 204, height: 100, rx: 10 }),
    svgElement('text', { x: 16, y: 23, class: 'workflow-kind' }, kind.toUpperCase()),
    svgElement('text', { x: 16, y: 50 }, String(item.data?.label || item.id).slice(0, 23)),
    svgElement('text', { x: 16, y: 78, class: 'workflow-id' }, item.id.slice(0, 26)),
    svgElement('circle', { cx: 0, cy: 50, r: 5, class: 'workflow-port', 'aria-hidden': true }),
    svgElement('circle', { cx: 204, cy: 50, r: 5, class: 'workflow-port', 'aria-hidden': true }));
  group.addEventListener('click', () => context.select(item.id));
  group.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    context.select(item.id);
  });
  svg.append(group);
}

export function renderCanvas(container, graph, options) {
  const { points, width, height } = layoutWorkflow(graph);
  const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, width, height,
    role: 'group', 'aria-label': 'Graphe éditable du workflow' });
  const defs = svgElement('defs', {});
  const marker = svgElement('marker', { id: 'workflow-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5,
    markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
  marker.append(svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 z' }));
  defs.append(marker);
  svg.append(defs);
  graph.edges.forEach(edge => drawEdge(svg, edge, points));
  graph.nodes.slice(0, 100).forEach(item => drawNode(svg, item, { ...options, points }));
  container.replaceChildren(svg);
  if (graph.nodes.length > 100) container.append(node('p', '100 nœuds affichés ; le JSON conserve le graphe complet.'));
}
