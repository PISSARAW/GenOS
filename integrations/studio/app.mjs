import { StudioClient } from './client.mjs';
import { byId, encoded, node, options, applyPermissions, errorMessage, showView } from './ui.mjs';

export const api = new StudioClient();
export const state = { current: null, runId: null, busy: false, epoch: 0 };

export function clearView() {
  state.current = null;
  state.runId = null;
  byId('inspection').hidden = true;
  for (const element of document.querySelectorAll('[data-runtime]')) element.replaceChildren();
  byId('approval-json').value = '';
  byId('workspace-choice').value = '';
  for (const form of document.querySelectorAll('form[data-action]')) form.reset();
  window.dispatchEvent(new Event('studio:cleared'));
}

export function disconnect() {
  state.epoch += 1;
  state.busy = false;
  api.setSession(null);
  clearView();
  byId('navigation').hidden = true;
  byId('token').value = '';
  for (const button of document.querySelectorAll('button')) button.disabled = false;
  applyPermissions(api);
  byId('message').textContent = 'Déconnecté.';
  window.dispatchEvent(new Event('studio:session'));
}

function keepDraft(error, options) {
  return options.preserveDraft && (error.status === 409 || error.name === 'AbortError' || error instanceof TypeError);
}

export async function perform(action, options = {}) {
  if (state.busy) return;
  const epoch = state.epoch;
  state.busy = true;
  byId('message').textContent = 'Chargement de l’état runtime…';
  const buttons = [...document.querySelectorAll('button:not(#disconnect)')];
  buttons.forEach(button => { button.disabled = true; });
  try {
    await action();
    if (epoch === state.epoch) byId('message').textContent = 'État runtime chargé.';
  } catch (error) {
    if (epoch !== state.epoch) return;
    if (error.status === 401) disconnect();
    else if (!keepDraft(error, options)) clearView();
    byId('message').textContent = error.status === 401 ? 'Session expirée. Reconnectez-vous.' : errorMessage(error);
  } finally {
    if (epoch === state.epoch) {
      state.busy = false;
      buttons.forEach(button => { button.disabled = false; });
      applyPermissions(api);
    }
  }
}

export function render(data) {
  state.current = data;
  state.runId = data.run.id;
  byId('run-id').textContent = data.run.id;
  byId('run-status').textContent = `État : ${data.run.status}`;
  byId('workspace').textContent = `Workspace : ${data.workspace.id} · ${data.workspace.name}`;
  byId('workspace-choice').value = data.workspace.id;
  byId('promotion').textContent = data.promotion ? `Journal vérifié : ${data.promotion.phase}` : 'Aucune promotion journalisée';
  byId('provenance').textContent = JSON.stringify(data.provenance, null, 2);
  byId('steps').replaceChildren(...data.run.steps.map(step => {
    const row = node('tr');
    row.append(node('td', step.stageKey), node('td', step.status));
    return row;
  }));
  byId('snapshots').replaceChildren(...data.snapshots.map(snapshot => node('li', `${snapshot.id} · ${snapshot.label}`)));
  byId('inspection').hidden = document.querySelector('[data-target="inspection"]').getAttribute('aria-pressed') !== 'true';
  window.dispatchEvent(new Event('studio:loaded'));
}

export async function loadRun(runId) {
  render(await api.request(`/api/product-proofs/consumer-runs/${encoded(runId)}`));
}

async function runList() {
  const runs = await api.request(`/api/agents/${encoded(api.session.agent)}/execution-runs`);
  const query = byId('run-query').value.toLowerCase();
  const status = byId('run-status-filter').value;
  const matching = runs.filter(run => (!status || run.status === status) &&
    [run.id, run.status, run.guardrailReason || ''].join(' ').toLowerCase().includes(query));
  byId('run-list').replaceChildren(...matching.map(run => {
    const item = node('li');
    const button = node('button', `${run.id} · ${run.status}`);
    button.type = 'button';
    button.addEventListener('click', () => perform(() => loadRun(run.id)));
    item.append(button);
    return item;
  }));
}

export async function refresh() {
  const endpoint = state.runId ? `consumer-runs/${encoded(state.runId)}` :
    `consumer-agents/${encoded(api.session.agent)}/latest`;
  await Promise.all([api.request('/api/product-proofs/' + endpoint).then(render), runList()]);
}

export async function discover() {
  options('organizations', await api.request('/api/control-plane/organizations'));
  if (!api.session.organization) return;
  options('projects', await api.request('/api/control-plane/projects'));
  if (!api.session.project) return;
  const [agents, workspaces] = await Promise.all([api.request('/api/agents'), api.request('/api/workspaces')]);
  options('agents', agents);
  options('workspaces', workspaces);
  if (!workspaces.some(item => item.id === byId('workspace-choice').value)) byId('workspace-choice').value = workspaces[0]?.id || '';
}

async function connect() {
  state.epoch += 1;
  state.busy = false;
  api.setSession({ token: byId('token').value, organization: byId('organization').value,
    project: byId('project').value, agent: byId('agent').value });
  byId('token').value = '';
  clearView();
  window.dispatchEvent(new Event('studio:session'));
  await perform(async () => {
    const session = await api.request('/api/auth/session');
    api.session.permissions = session.user.permissions;
    byId('navigation').hidden = false;
    showView('inspection');
    await discover();
    if (api.session.agent) await refresh();
    window.dispatchEvent(new Event('studio:ready'));
  });
}

async function changeScope(event) {
  if (!api.session) return;
  if (event.target.id === 'organization') byId('project').value = '';
  if (event.target.id !== 'agent') byId('agent').value = '';
  const session = { ...api.session, organization: byId('organization').value,
    project: byId('project').value, agent: byId('agent').value };
  state.epoch += 1;
  state.busy = false;
  api.setSession(session);
  clearView();
  window.dispatchEvent(new Event('studio:session'));
  await perform(async () => { await discover(); if (session.agent) await refresh(); window.dispatchEvent(new Event('studio:ready')); });
}

export function start() {
  byId('connection').addEventListener('submit', event => { event.preventDefault(); connect(); });
  byId('disconnect').addEventListener('click', disconnect);
  for (const id of ['organization', 'project', 'agent']) byId(id).addEventListener('change', changeScope);
  byId('refresh').addEventListener('click', () => perform(refresh));
  byId('run-search').addEventListener('submit', event => { event.preventDefault(); perform(runList); });
  for (const button of document.querySelectorAll('[data-target]')) {
    button.addEventListener('click', () => { showView(button.dataset.target); window.dispatchEvent(new Event('studio:view')); });
  }
  byId('snapshot').addEventListener('click', () => perform(async () => {
    await api.request(`/api/workspaces/${encoded(state.current.workspace.id)}/snapshots`,
      { body: { label: 'Studio', reason: 'Operator capture' } });
    await refresh();
  }));
  byId('approval').addEventListener('submit', event => {
    event.preventDefault();
    perform(async () => {
      await api.request(`/api/execution-runs/${encoded(state.current.run.id)}/approve`,
        { body: JSON.parse(byId('approval-json').value) });
      byId('approval-json').value = '';
      await refresh();
    });
  });
}
