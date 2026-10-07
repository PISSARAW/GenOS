import { api, state, disconnect, refresh, perform } from './app.mjs';
import { byId, node, displayList } from './ui.mjs';
import { EventStream } from './events.mjs';
import { runMetrics } from './metrics.mjs';

let refreshTimer;

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
  displayList('dashboard-stats', [
    `Agents actifs : ${data.activeAgents}`,
    `Actions observées : ${data.stats.total_actions}`,
    `Workspaces affichés : ${data.pinned.length}`
  ], text => text);
  renderGraph(lineage);
}

function renderGraph(graph) {
  const names = new Map(graph.nodes.map(item => [item.id, item.label || item.id]));
  displayList('lineage-nodes', graph.nodes, item => `${item.label || item.id} · ${item.type} · ${item.summary || ''}`);
  displayList('lineage-edges', graph.edges, edge =>
    `${names.get(edge.source) || edge.source} → ${names.get(edge.target) || edge.target} (${edge.type})`);
  const svg = byId('lineage-graph');
  svg.replaceChildren();
  const shown = graph.nodes.slice(0, 100);
  const positions = new Map(shown.map((item, index) => [item.id, { x: 120 + (index % 4) * 220, y: 40 + Math.floor(index / 4) * 100 }]));
  svg.setAttribute('viewBox', `0 0 1000 ${Math.max(120, Math.ceil(shown.length / 4) * 100)}`);
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
  const group = svgNode('g', { tabindex: '0', role: 'img', 'aria-label': item.label || item.id });
  group.append(svgNode('circle', { cx: position.x, cy: position.y, r: 14, fill: '#72ddc2' }));
  const text = svgNode('text', { x: position.x, y: position.y + 30, fill: '#e8eef7', 'text-anchor': 'middle' });
  text.textContent = (item.label || item.id).slice(0, 25);
  group.append(text);
  const title = svgNode('title', {});
  title.textContent = `${item.id} · ${item.summary || ''}`;
  group.append(title);
  svg.append(group);
}

function renderMetrics() {
  if (!state.current) return;
  byId('metrics').replaceChildren(...runMetrics(state.current.run).map(([label, value]) => {
    const row = node('tr');
    row.append(node('th', label), node('td', value));
    return row;
  }));
  displayList('trajectory', state.current.run.steps, step =>
    `${step.sequence} · ${step.stageKey} · ${step.status} · ${step.startedAt || 'Début inconnu'} → ${step.completedAt || 'Fin inconnue'}`);
}

const stream = new EventStream(api, { event: eventReceived,
  status: text => { byId('stream-status').textContent = text; },
  expired: disconnect, sync: async () => { await dashboard(); scheduleRefresh(); } });

export function startSupervision() {
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
