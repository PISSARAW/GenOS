import { api } from './app.mjs';
import { byId, encoded, options } from './ui.mjs';
import { renderResponse } from './components.mjs';
import { uncertainEffect } from './actionState.mjs';
import { initialGraph, workflowWrite, draftUnchanged } from './workflowDraft.mjs';
import { WorkflowEditor } from './builderEditor.mjs';
import { renderWorkflowRuns } from './builderRuns.mjs';

function localAction(action) {
  try { action(); } catch (error) {
    byId('message').textContent = error.message;
    byId('message').dataset.tone = 'error';
  }
}

export class BuilderSession {
  constructor() {
    this.loaded = null;
    this.baseline = '';
    this.draftWorkspace = '';
    this.blocked = false;
    this.editor = new WorkflowEditor(localAction);
  }

  documentValue() {
    return { name: byId('builder-name').value, description: byId('builder-description').value,
      status: byId('builder-status').value, graph: this.editor.graph(), metadata: JSON.parse(byId('builder-metadata').value) };
  }

  fingerprint() {
    return JSON.stringify(['builder-name', 'builder-description', 'builder-status', 'builder-json',
      'builder-metadata'].map(id => byId(id).value));
  }

  dirty() { return this.baseline !== this.fingerprint() || this.editor.pending(); }
  path() { return '/api/workflows/' + encoded(this.loaded.id); }

  clear() {
    this.reset();
    byId('builder-run-input').value = '{}';
    byId('builder-workflow').replaceChildren();
  }

  reset(workflow = null) {
    this.loaded = workflow;
    this.blocked = false;
    const value = workflow || { workspace_id: byId('workspace-choice').value, name: '', description: '',
      status: 'draft', metadata: {}, graph: initialGraph() };
    this.draftWorkspace = value.workspace_id;
    byId('builder-name').value = value.name;
    byId('builder-description').value = value.description || '';
    byId('builder-status').value = value.status;
    byId('builder-metadata').value = JSON.stringify(value.metadata, null, 2);
    this.editor.reset(value.graph);
    this.baseline = this.fingerprint();
    byId('builder-version').textContent = workflow ? `Version ${workflow.version} · ${workflow.status} · ${workflow.id}` : 'Nouveau brouillon local';
    byId('builder-runs').replaceChildren();
    byId('builder-result').replaceChildren();
    byId('builder-result-summary').replaceChildren();
  }

  requireSaved() {
    if (!this.loaded) throw new Error('Sauvegardez ou ouvrez d’abord un workflow.');
    if (this.dirty()) throw new Error('Sauvegardez les changements avant d’essayer ou de publier cette version.');
    if (this.blocked) throw new Error('Effet précédent incertain : ouvrez de nouveau la version persistée avant toute mutation.');
  }

  async catalog() {
    const rows = await api.request('/api/workflows?workspaceId=' + encoded(byId('workspace-choice').value));
    options('builder-workflow', rows.map(item => ({ id: item.id, name: `${item.name} · v${item.version} · ${item.status}` })));
    if (!rows.length) byId('builder-version').textContent = 'Aucun workflow dans ce workspace. Créez un nouveau brouillon.';
  }

  async open() {
    const id = byId('builder-workflow').value;
    if (!id) throw new Error('Choisissez un workflow du workspace.');
    const workflow = await api.request('/api/workflows/' + encoded(id));
    if (workflow.workspace_id !== byId('workspace-choice').value) throw new Error('Le workflow n’appartient pas au workspace sélectionné.');
    this.reset(workflow);
    await this.catalog();
    byId('builder-workflow').value = workflow.id;
  }

  async mutate(endpoint, spec) {
    if (this.blocked) throw new Error('Effet précédent incertain : inspectez la version persistée avant de réessayer.');
    try { return await api.request(endpoint, spec); } catch (error) {
      if (uncertainEffect(error)) {
        this.blocked = true;
        byId('builder-version').textContent = 'Effet incertain : relecture explicite requise. Aucun retry automatique.';
      }
      throw error;
    }
  }

  async save() {
    this.editor.requireApplied();
    const value = this.documentValue();
    if (!value.name.trim()) throw new Error('Le nom du workflow est requis.');
    if (this.draftWorkspace !== byId('workspace-choice').value) throw new Error('Le contexte du workspace a changé. Ouvrez un nouveau brouillon.');
    const sent = this.fingerprint();
    const body = workflowWrite(value, this.loaded, this.draftWorkspace);
    const result = await this.mutate(this.loaded ? this.path() : '/api/workflows', { method: this.loaded ? 'PUT' : 'POST', body });
    if (draftUnchanged(sent, this.fingerprint(), this.editor.pending())) this.reset(result);
    else {
      this.loaded = result;
      this.baseline = sent;
      this.editor.setBaseline(result.graph);
      byId('builder-version').textContent = `Version ${result.version} sauvegardée ; brouillon local modifié depuis l’envoi.`;
    }
    renderResponse('builder-result', result);
    await this.catalog();
    byId('builder-workflow').value = result.id;
  }

  async validate() {
    this.editor.requireApplied();
    if (!this.loaded) throw new Error('Sauvegardez le premier workflow pour le valider côté serveur.');
    const result = await api.request(this.path() + '/validate', { body: { graph: this.editor.graph() } });
    renderResponse('builder-result', result);
    byId('builder-version').textContent = result.valid ? 'Graphe valide ; comportement, qualité et publication non validés.' : result.errors.join(' ');
  }

  async run() {
    this.requireSaved();
    const result = await this.mutate(this.path() + '/runs', { body: { expectedVersion: this.loaded.version,
      input: JSON.parse(byId('builder-run-input').value) } });
    renderResponse('builder-result', result);
    byId('builder-version').textContent = `Version ${result.version} admise : ${result.status}. Observer l’exécution pour connaître son résultat.`;
    await this.observe();
  }

  async observe() {
    if (!this.loaded) throw new Error('Ouvrez un workflow.');
    renderWorkflowRuns(await api.request(this.path() + '/runs'));
  }

  async publication() {
    this.requireSaved();
    const workflow = await api.request(this.path());
    if (workflow.version !== this.loaded.version) throw new Error('Version modifiée : rechargez avant de préparer la publication.');
    window.dispatchEvent(new CustomEvent('studio:workflow-publication', { detail: { workflowId: workflow.id, version: workflow.version } }));
    const generation = api.generation;
    window.addEventListener('studio:idle', () => {
      if (generation === api.generation && api.session) document.querySelector('[data-target="production-view"]').click();
    }, { once: true });
  }


}
