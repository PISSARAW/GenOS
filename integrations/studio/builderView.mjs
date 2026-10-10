import { byId, node } from './ui.mjs';

export function control(id, label, options = {}) {
  const wrapper = node('label', label);
  const element = node(options.tag || 'input');
  element.id = id;
  if (options.type) element.type = options.type;
  if (options.value !== undefined) element.value = options.value;
  if (options.rows) element.rows = options.rows;
  for (const value of options.options || []) {
    const choice = node('option', value.label || value);
    choice.value = value.value || value;
    element.append(choice);
  }
  wrapper.append(element);
  return wrapper;
}

export function button(id, text, permission = 'read') {
  const element = node('button', text);
  element.id = id;
  element.type = 'button';
  element.dataset.permission = permission;
  return element;
}

function panel(title) {
  const element = node('section');
  element.className = 'panel';
  element.append(node('h3', title));
  return element;
}

function toolbar() {
  const bar = node('div');
  bar.className = 'builder-toolbar';
  bar.append(button('builder-catalog', 'Charger les workflows'),
    control('builder-workflow', 'Workflow du workspace', { tag: 'select' }),
    button('builder-load', 'Ouvrir la sélection'), button('builder-new', 'Nouveau workflow'));
  return bar;
}

function inspector() {
  const pane = panel('Nœud sélectionné');
  pane.className += ' builder-inspector';
  pane.append(control('builder-node-id', 'Identifiant du nœud'), control('builder-node-label', 'Nom lisible'),
    control('builder-node-kind', 'Type', { tag: 'select', options: ['input', 'output', 'llm', 'tool', 'parallel', 'loop'] }),
    control('builder-node-model', 'Modèle réel — URI du provider'),
    control('builder-node-prompt', 'Prompt — variables {{input.champ}}', { tag: 'textarea', rows: 4 }),
    control('builder-node-tool', 'Outil MCP — nom exact'), control('builder-node-agent', 'Agent autorisé pour l’outil'),
    control('builder-node-args', 'Arguments de l’outil JSON', { tag: 'textarea', value: '{}', rows: 3 }),
    button('builder-node-apply', 'Appliquer au brouillon'), button('builder-node-remove', 'Supprimer le nœud'));
  return pane;
}

function graphPane() {
  const pane = panel('Graphe du workflow');
  pane.className += ' canvas-panel';
  pane.querySelector('h3').className = 'sr-only';
  const tools = node('div');
  tools.className = 'canvas-tools';
  const palette = node('details');
  palette.className = 'node-palette';
  palette.append(node('summary', '+ Ajouter un nœud'));
  const fields = node('div');
  fields.className = 'builder-toolbar';
  fields.append(control('builder-add-kind', 'Nouveau nœud', { tag: 'select', options: ['input', 'output', 'llm', 'tool', 'parallel', 'loop'] }),
    button('builder-node-add', 'Ajouter un nœud'));
  palette.append(fields);
  tools.append(palette);
  const canvas = node('div');
  canvas.id = 'builder-canvas';
  canvas.className = 'workflow-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Graphe du workflow, zoom et défilement disponibles');
  const edges = node('ul');
  edges.id = 'builder-edges';
  const links = node('div');
  links.className = 'builder-toolbar';
  links.append(control('builder-edge-source', 'Depuis le nœud', { tag: 'select' }),
    control('builder-edge-target', 'Vers le nœud', { tag: 'select' }), button('builder-edge-add', 'Relier les nœuds'));
  pane.append(tools, canvas, links, edges);
  return pane;
}

function playground() {
  const pane = panel('Essayer la version sauvegardée');
  pane.append(node('p', 'Un worker doit être disponible. L’admission queued ne vaut ni exécution terminée ni promotion.'),
    control('builder-run-input', 'Entrées JSON — sans secrets', { tag: 'textarea', value: '{}', rows: 3 }),
    button('builder-run', 'Exécuter la version sauvegardée', 'experiment:run'),
    button('builder-observe', 'Observer les exécutions'));
  const runs = node('div');
  runs.id = 'builder-runs';
  runs.dataset.runtime = '';
  pane.append(runs);
  return pane;
}

export function buildView() {
  const view = node('section');
  view.id = 'builder-view';
  view.dataset.view = '';
  view.hidden = true;
  view.className = 'builder-view';
  const header = node('div');
  header.className = 'view-heading';
  const intro = node('div');
  intro.append(node('p', 'CONSTRUIRE · ESSAYER · PUBLIER'), node('h2', 'Construire'),
    node('p', 'Un graphe canonique, une version sauvegardée, une exécution observée.'));
  header.append(intro);
  const identity = panel('Configuration du workflow');
  const version = node('p', 'Nouveau brouillon local');
  version.id = 'builder-version';
  version.setAttribute('role', 'status');
  identity.append(control('builder-name', 'Nom du workflow'), control('builder-description', 'Description'),
    control('builder-status', 'État après sauvegarde', { tag: 'select', options: ['draft', 'staging', 'published', 'archived'] }), version,
    button('builder-save', 'Sauvegarder', 'workspace:write'), button('builder-validate', 'Valider'),
    button('builder-publish', 'Publier…'));
  identity.querySelector('#builder-save').setAttribute('aria-label', 'Sauvegarder la version');
  identity.querySelector('#builder-validate').setAttribute('aria-label', 'Valider le graphe');
  identity.querySelector('#builder-publish').setAttribute('aria-label', 'Préparer la publication');
  const layout = node('div');
  layout.className = 'builder-layout';
  layout.append(graphPane(), inspector());
  const advanced = node('details');
  advanced.className = 'panel';
  advanced.append(node('summary', 'Édition JSON sans perte et métadonnées'),
    control('builder-json', 'Graphe canonique JSON', { tag: 'textarea', rows: 12 }),
    button('builder-json-apply', 'Appliquer le JSON au graphe'),
    control('builder-metadata', 'Métadonnées JSON', { tag: 'textarea', rows: 3, value: '{}' }));
  const changes = node('p');
  changes.id = 'builder-changes';
  changes.setAttribute('role', 'status');
  const result = node('div');
  result.id = 'builder-result-summary';
  result.dataset.runtime = '';
  const technical = node('details');
  technical.append(node('summary', 'Réponse technique'));
  const output = node('pre');
  output.id = 'builder-result';
  output.dataset.runtime = '';
  technical.append(output);
  view.append(header, toolbar(), identity, layout, advanced, changes, playground(), result, technical);
  byId('view-content').append(view);
  byId('builder-save').classList.add('primary');
  const navigation = button('builder-navigation', 'Construire');
  navigation.dataset.target = view.id;
  byId('navigation').prepend(navigation);
  return view;
}
