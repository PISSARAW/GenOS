import { byId, node, options } from './ui.mjs';
import { parseGraph, insertNode, replaceNode, removeNode, connectNodes, removeEdge, changeSummary } from './workflowDraft.mjs';
import { renderCanvas } from './workflowCanvas.mjs';

const fields = ['id', 'label', 'kind', 'model', 'prompt', 'tool', 'agent', 'args'];

function property(item, key, fallback = '') {
  return item[key] || item.data?.[key] || fallback;
}

function inspectorValue(item) {
  return { id: item.id, label: property(item, 'label', item.id), kind: property(item, 'kind', item.type || 'output'),
    model: property(item, 'model'), prompt: property(item, 'prompt'), tool: property(item, 'tool'),
    agent: property(item, 'agentId'), args: JSON.stringify(property(item, 'args', {}), null, 2) };
}

function readInspector() {
  return Object.fromEntries(fields.map(key => [key, byId('builder-node-' + key).value]));
}

function patch(value) {
  const properties = { kind: value.kind, model: value.model, prompt: value.prompt, tool: value.tool,
    agentId: value.agent, args: JSON.parse(value.args) };
  return { id: value.id.trim(), type: value.kind, label: value.label, ...properties, data: { label: value.label, ...properties } };
}

function renderLinks(graph, change) {
  const labels = graph.nodes.map(item => ({ id: item.id, name: item.data?.label || item.id }));
  options('builder-edge-source', labels);
  options('builder-edge-target', labels);
  byId('builder-edges').replaceChildren(...graph.edges.map((edge, index) => {
    const item = node('li');
    const remove = node('button', 'Retirer ' + edge.source + ' → ' + edge.target);
    remove.type = 'button';
    remove.addEventListener('click', () => change(index));
    item.append(remove);
    return item;
  }));
}

export class WorkflowEditor {
  constructor(localAction) {
    this.localAction = localAction;
    this.selected = '';
    this.inspectorBaseline = '';
    this.baseGraph = null;
    bindEditor(this);
  }

  pending() {
    return Boolean(this.selected && JSON.stringify(readInspector()) !== this.inspectorBaseline);
  }

  graph() {
    return parseGraph(byId('builder-json').value);
  }

  loadInspector(item) {
    this.selected = item?.id || '';
    const values = item ? inspectorValue(item) : Object.fromEntries(fields.map(key => [key, '']));
    const kind = byId('builder-node-kind');
    if (item && ![...kind.options].some(option => option.value === values.kind)) {
      const choice = node('option', values.kind);
      choice.value = values.kind;
      kind.append(choice);
    }
    for (const key of fields) byId('builder-node-' + key).value = values[key];
    this.inspectorBaseline = JSON.stringify(readInspector());
  }

  select(id) {
    if (this.pending() && !window.confirm('Abandonner les changements du nœud non appliqués ?')) return;
    this.loadInspector(this.graph().nodes.find(item => item.id === id));
    this.draw(this.graph());
  }

  draw(next) {
    renderCanvas(byId('builder-canvas'), next, { selected: this.selected,
      select: id => this.localAction(() => this.select(id)) });
  }

  change(next) {
    byId('builder-json').value = JSON.stringify(next, null, 2);
    this.draw(next);
    renderLinks(next, index => this.editGraph(() => this.removeLink(next, index)));
    const diff = changeSummary(this.baseGraph, next);
    byId('builder-changes').textContent = `${diff.added.length} nœud(s) ajouté(s), ${diff.removed.length} supprimé(s), ` +
      `${diff.modified.length} modifié(s). Liens modifiés : ${diff.linksChanged ? 'oui' : 'non'}. Validation serveur requise.`;
  }

  reset(next, baseline = next) {
    this.baseGraph = baseline;
    this.loadInspector(null);
    this.change(next);
    if (next.nodes[0]) this.select(next.nodes[0].id);
  }

  requireApplied() {
    if (this.pending()) throw new Error('Appliquez les changements du nœud avant cette action.');
  }

  setBaseline(next) { this.baseGraph = next; }

  editGraph(action) {
    this.localAction(() => { this.requireApplied(); action(); });
  }

  add() {
    const next = insertNode(this.graph(), byId('builder-add-kind').value);
    this.change(next);
    this.select(next.nodes.at(-1).id);
  }

  apply() {
    if (!this.selected) throw new Error('Sélectionnez un nœud.');
    const value = patch(readInspector());
    const next = replaceNode(this.graph(), this.selected, value);
    this.selected = value.id;
    this.change(next);
    this.loadInspector(next.nodes.find(item => item.id === this.selected));
  }

  remove() {
    const next = removeNode(this.graph(), this.selected);
    this.loadInspector(null);
    this.change(next);
  }

  link() {
    this.change(connectNodes(this.graph(), { source: byId('builder-edge-source').value,
      target: byId('builder-edge-target').value }));
  }

  removeLink(displayed, index) {
    const current = this.graph();
    if (JSON.stringify(displayed.edges) !== JSON.stringify(current.edges)) {
      throw new Error('Appliquez le JSON modifié avant de retirer un lien affiché.');
    }
    this.change(removeEdge(current, index));
  }
}

function bindEditor(editor) {
  byId('builder-node-add').addEventListener('click', () => editor.editGraph(() => editor.add()));
  byId('builder-node-apply').addEventListener('click', () => editor.localAction(() => editor.apply()));
  byId('builder-node-remove').addEventListener('click', () => editor.editGraph(() => editor.remove()));
  byId('builder-edge-add').addEventListener('click', () => editor.editGraph(() => editor.link()));
  byId('builder-json-apply').addEventListener('click', () => editor.editGraph(() => editor.reset(editor.graph(), editor.baseGraph)));
}
