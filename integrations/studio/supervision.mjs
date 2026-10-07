import { api, state, disconnect, refresh, perform } from './app.mjs';
import { byId, node, displayList } from './ui.mjs';
import { EventStream } from './events.mjs';
import { runMetrics } from './metrics.mjs';
import { badge, metricTile } from './presentation.mjs';
import { renderData } from './components.mjs';

let refreshTimer;
let observedGraph = null;
let selectedNodeId = null;

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    if (!api.session || !state.current || !byId('live-toggle').checked) return;
    if (state.busy) { scheduleRefresh(); return; }
    await perform(refresh);
  }, 500);
}

function eventReceived(event) {
  if (event.eventType === 'TELEMETRY_CONNECTED') return;
  const item = node('li', `${event.timestamp || ''} · ${event.eventType} · ${event.detail || ''}`);
  byId('events').prepend(item);
  while (byId('events').children.length > 100) byId('events').lastChild.remove();
  if (event.agentId === api.session?.agent) scheduleRefresh();
}

export async function dashboard() {
  if (!api.allowed('telemetry:read') || !api.session.project) return;
  const [data, lineage] = await Promise.all([api.request('/api/dashboard'), api.request('/api/lineage')]);
  const metrics = [['Agents actifs', data.activeAgents], ['Actions observées', data.stats.total_actions],
    ['Workspaces affichés', data.pinned.length]];
  byId('dashboard-stats').replaceChildren(...metrics.map(([label, value]) => {
    const item = node('li');
    item.append(node('span', label), node('strong', String(value)));
    return item;
  }));
  renderGraph(lineage);
}

function renderGraph(graph) {
  observedGraph = graph;
  byId('lineage-status').textContent = graph.nodes.length
    ? graph.nodes.length + ' nœuds retournés ; au plus 100 dessinés. La couverture globale n’est pas garantie.'
    : 'Aucune lignée retournée pour ce projet. Vérifiez le projet sélectionné et la collecte ; cet écran ne fabrique aucune branche.';
  const names = new Map(graph.nodes.map(item => [item.id, item.label || item.id]));
  displayList('lineage-nodes', graph.nodes, item => `${item.label || item.id} · ${item.type} · ${item.summary || ''}`);
  displayList('lineage-edges', graph.edges, edge =>
    `${names.get(edge.source) || edge.source} → ${names.get(edge.target) || edge.target} (${edge.type})`);
  const svg = byId('lineage-graph');
  svg.replaceChildren();
  svg.hidden = !graph.nodes.length;
  byId('lineage-viewport').hidden = !graph.nodes.length;
  byId('lineage-detail').replaceChildren(node('p', 'Sélectionnez un nœud pour inspecter sa provenance.'));
  const shown = graph.nodes.slice(0, 100);
  const columns = window.matchMedia('(max-width:600px)').matches ? 1 : Math.max(1, Math.min(4, shown.length));
  svg.style.minWidth = columns * 245 + 'px';
  svg.style.height = Math.max(240, Math.ceil(shown.length / columns) * 110) + 'px';
  const positions = new Map(shown.map((item, index) => [item.id, { x: 125 + (index % columns) * 245, y: 45 + Math.floor(index / columns) * 110 }]));
  svg.setAttribute('viewBox', `0 0 ${columns * 245} ${Math.max(120, Math.ceil(shown.length / columns) * 110)}`);
  for (const edge of graph.edges) drawEdge(svg, positions, edge);
  for (const item of shown) drawNode(svg, positions.get(item.id), item);
}

function svgNode(tag, attributes) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function drawEdge(svg, positions, edge) {
  const a = positions.get(edge.source);
  const b = positions.get(edge.target);
  if (!a || !b) return;
  svg.append(svgNode('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#72ddc2' }));
}

function drawNode(svg, position, item) {
  const group = svgNode('g', { tabindex: '0', role: 'button', 'aria-pressed': 'false', 'aria-label': item.label || item.id });
  group.append(svgNode('rect', { x: position.x - 100, y: position.y - 28, width: 200, height: 60, rx: 8, fill: '#182c38', stroke: '#4e786d' }));
  const text = svgNode('text', { x: position.x, y: position.y, fill: '#e8eef7', 'text-anchor': 'middle', 'font-size': 12 });
  text.textContent = (item.label || item.id).slice(0, 25);
  group.append(text);
  const type = svgNode('text', { x: position.x, y: position.y + 18, fill: '#aec7d7', 'text-anchor': 'middle', 'font-size': 10 });
  type.textContent = item.type || 'Type inconnu';
  group.append(type);
  const title = svgNode('title', {});
  title.textContent = `${item.id} · ${item.summary || ''}`;
  group.append(title);
  const select = () => {
    selectedNodeId = item.id;
    for (const other of svg.querySelectorAll('[role=button]')) other.setAttribute('aria-pressed', String(other === group));
    renderData('lineage-detail', { ...item, name: item.label || item.id });
    byId('lineage-detail').append(node('p', item.summary || 'Aucun résumé observé.'));
  };
  group.addEventListener('click', select);
  group.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    select();
  });
  svg.append(group);
  if (selectedNodeId === item.id) select();
}

function renderMetrics() {
  if (!state.current) return;
  byId('metrics').replaceChildren(...runMetrics(state.current.run).map(([label, value]) => {
    const row = node('tr');
    const heading = node('th', label);
    heading.scope = 'row';
    row.append(heading, node('td', value));
    return row;
  }));
  const highlights = runMetrics(state.current.run).slice(0, 3);
  byId('run-highlights').replaceChildren(...highlights.map(([label, value]) => {
    const split = value.indexOf(' (');
    return metricTile(label, split < 0 ? value : value.slice(0, split), split < 0 ? '' : value.slice(split + 2, -1));
  }));
  const steps = state.current.run.steps.map(step => {
    const item = node('li');
    item.dataset.status = step.status;
    item.append(node('strong', step.sequence + ' · ' + step.stageKey), badge(step.status),
      node('time', `${step.startedAt || 'Début inconnu'} → ${step.completedAt || 'Fin inconnue'}`));
    return item;
  });
  byId('trajectory').replaceChildren(...(steps.length ? steps : [node('li', 'Aucune étape observée.')]));
}

const stream = new EventStream(api, { event: eventReceived,
  status: text => { byId('stream-status').textContent = text; },
  expired: () => disconnect({ force: true }), sync: async () => { await dashboard(); scheduleRefresh(); } });

export function startSupervision() {
  window.matchMedia('(max-width:600px)').addEventListener('change', () => {
    if (observedGraph && api.session) renderGraph(observedGraph);
  });
  window.addEventListener('studio:cleared', () => { observedGraph = null; selectedNodeId = null; });
  window.addEventListener('studio:session', () => { stream.stop(); clearTimeout(refreshTimer); });
  window.addEventListener('studio:loaded', renderMetrics);
  window.addEventListener('studio:ready', () => {
    if (!byId('live-toggle').checked) {
      byId('stream-status').textContent = 'Actualisation manuelle';
      return;
    }
    byId('stream-status').textContent = api.allowed('telemetry:read') ? 'Connexion…' : 'Permission telemetry:read requise.';
    stream.start();
  });
  byId('dashboard-refresh').addEventListener('click', () => perform(dashboard));
  byId('live-toggle').addEventListener('change', () => {
    if (byId('live-toggle').checked) stream.start();
    else {
      stream.stop();
      clearTimeout(refreshTimer);
      byId('stream-status').textContent = 'Actualisation manuelle';
    }
  });
}
