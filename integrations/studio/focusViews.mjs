import { byId, node } from './ui.mjs';
import { taskDeck, columns } from './taskDeck.mjs';
import { operationPicker } from './operationPicker.mjs';

const group = (key, title, content) => ({ key, title, content });
const element = selector => document.querySelector(selector);

function journey(view) {
  const actions = view.querySelector(':scope > .action-list');
  operationPicker(actions);
  const summary = view.querySelector('[id$="-result-summary"]');
  const technical = view.querySelector(':scope > details');
  const guide = view.querySelector(':scope > ol');
  const intro = view.querySelector('.view-heading .muted');
  taskDeck(view, [group('actions', 'Agir', [actions]), group('result', 'Résultat', [summary, technical]),
    group('guide', 'Repères et limites', [intro, guide])]);
}

function inspection() {
  taskDeck(byId('inspection'), [group('run', 'Dossier', [columns([
    element('.run-browser'), element('.trace-detail')])]),
  group('evidence', 'Preuves et snapshots', [element('.evidence-inspector')])]);
}

function dashboard() {
  const graph = element('.dashboard-layout > section');
  const detail = byId('lineage-detail');
  const events = byId('events');
  taskDeck(byId('dashboard-view'), [group('lineage', 'Lignées', [element('.live-bar'), byId('dashboard-stats'),
    columns([graph, detail])]), group('events', 'Événements', [events])]);
}

function management() {
  const actions = byId('management-actions');
  operationPicker(actions);
  const result = byId('management-result');
  const data = byId('management-data');
  const terminal = byId('terminal');
  const scope = element('#management-view .two-column > section > p');
  taskDeck(byId('management-view'), [group('catalog', 'Catalogue', [scope, byId('management-read'), byId('management-summary'), data.parentElement]),
    group('actions', 'Agir', [byId('management-action-filter').parentElement, byId('management-filter-status'), actions]),
    group('result', 'Résultat', [byId('management-result-summary'), result.parentElement]),
    group('operations', 'Exploitation', [terminal, byId('terminal-output'), byId('operations-diagnostics').closest('details')])]);
}

function files() {
  const editor = element('.editor-panel');
  const diff = byId('file-diff');
  taskDeck(byId('files-view'), [group('editor', 'Éditer', [byId('files-refresh'), columns([element('.file-browser'), editor])]),
    group('diff', 'Changements', [diff]), group('snapshots', 'Snapshots et reprise', [element('.snapshot-inspector')])]);
}

function research() {
  const actions = byId('research-actions');
  operationPicker(actions);
  const context = element('.research-drawer');
  const limits = element('#research-view > details');
  const arena = byId('arena-results').closest('details');
  taskDeck(byId('research-view'), [group('explore', 'Explorer', [byId('research-refresh'), context]),
    group('actions', 'Protocoles et actions', [byId('research-action-filter').parentElement, byId('research-filter-status'), actions]),
    group('compare', 'Comparer', [element('.comparison-panel')]),
    group('result', 'Résultats', [byId('research-summary'), byId('research-data').parentElement]),
    group('response', 'Réponse d’action', [byId('research-result-summary'), byId('research-result').parentElement]),
    group('arena', 'Arène', [arena]), group('guide', 'Repères', [limits])]);
}

function builder() {
  const layout = element('.builder-layout');
  const advanced = byId('builder-json').closest('details');
  advanced.open = true;
  const actions = node('div');
  actions.className = 'builder-primary-actions';
  actions.append(byId('builder-version'), byId('builder-save'), byId('builder-validate'), byId('builder-publish'));
  const links = byId('builder-edge-source').closest('.builder-toolbar');
  taskDeck(byId('builder-view'), [group('graph', 'Graphe', [actions, layout, byId('builder-changes')]),
    group('config', 'Configuration', [byId('builder-name').closest('section')]),
    group('catalog', 'Workflows', [element('.builder-toolbar')]),
    group('links', 'Connexions', [links, byId('builder-edges')]),
    group('playground', 'Essai', [byId('builder-run-input').closest('section')]),
    group('json', 'JSON avancé', [advanced]),
    group('result', 'Réponse', [byId('builder-result-summary'), byId('builder-result').closest('details')])]);
}

export function organizeViews() {
  for (const view of document.querySelectorAll('.journey-view')) journey(view);
  inspection();
  dashboard();
  management();
  files();
  research();
  builder();
}
