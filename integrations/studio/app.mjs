import { StudioClient } from './client.mjs';
import { byId, encoded, node, options, applyPermissions, errorMessage, showView } from './ui.mjs';
import { connectedShell } from './shell.mjs';
import { renderResponse } from './components.mjs';
import { holdButtons, preserveFailure, uncertainEffect } from './actionState.mjs';

export const api = new StudioClient();
export const state = { current: null, runId: null, busy: false, epoch: 0, runOffset: 0, runSearch: '' };

export function clearView() {
  state.current = null;
  state.runId = null;
  state.runOffset = 0;
  state.runSearch = '';
  byId('run-more').hidden = true;
  byId('run-list').setAttribute('aria-busy', 'false');
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
  connectedShell(false);
  byId('token').value = '';
  for (const button of document.querySelectorAll('button')) button.disabled = false;
  applyPermissions(api);
  byId('message').textContent = 'Déconnecté.';
  byId('message').dataset.tone = 'neutral';
  byId('view-label').textContent = 'Espace de travail';
  window.dispatchEvent(new CustomEvent('studio:session', { detail: { reason: 'disconnect' } }));
}

function showFailure(error, options) {
  byId('message').dataset.tone = 'error';
  if (error.status === 401) {
    disconnect();
    byId('message').textContent = 'Session expirée. Reconnectez-vous.';
    byId('message').dataset.tone = 'error';
    return;
  }
  const keepView = preserveFailure(error, options);
  if (!keepView) clearView();
  byId('message').textContent = errorMessage(error) +
    (options.preserveView && keepView ? ' Dernier dossier conservé ; actualisation non confirmée.' : '') +
    (uncertainEffect(error) ? ' Effet non confirmé : inspectez l’état avant de réessayer.' : '');
  byId('message').dataset.errorKind = error.kind || 'unknown';
}

export async function perform(action, options = {}) {
  if (state.busy) return;
  const epoch = state.epoch;
  state.busy = true;
  byId('message').textContent = 'Chargement de l’état runtime…';
  byId('message').dataset.tone = 'loading';
  delete byId('message').dataset.errorKind;
  const releaseButtons = holdButtons(document);
  try {
    await action();
    if (epoch === state.epoch) {
      byId('message').textContent = 'État runtime chargé.';
      byId('message').dataset.tone = 'success';
    }
    return epoch === state.epoch;
  } catch (error) {
    if (epoch !== state.epoch) return;
    showFailure(error, options);
  } finally {
    if (epoch === state.epoch) {
      state.busy = false;
      releaseButtons();
      applyPermissions(api);
      window.dispatchEvent(new Event('studio:idle'));
    }
  }
}

export function render(data) {
  state.current = data;
  state.runId = data.run.id;
  byId('run-id').textContent = data.run.id;
  byId('run-status').textContent = `État : ${data.run.status}`;
  byId('run-status').dataset.status = data.run.status;
  for (const button of byId('run-list').querySelectorAll('button')) {
    button.setAttribute('aria-current', String(button.dataset.runId === data.run.id));
  }
  byId('workspace').textContent = `Workspace : ${data.workspace.id} · ${data.workspace.name}`;
  byId('workspace-choice').value = data.workspace.id;
  byId('promotion').textContent = data.promotion ? `Journal vérifié : ${data.promotion.phase}` : 'Aucune promotion journalisée';
  renderResponse('provenance', data.provenance);
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

function renderRuns(data, append) {
  const existing = append ? [...byId('run-list').children] : [];
  const rows = data.runs.map(run => {
    const item = node('li');
    const button = node('button');
    const label = node('span', run.id);
    label.className = 'technical-id';
    const status = node('span', run.status);
    status.className = 'status-badge';
    status.dataset.status = run.status;
    button.append(label, status);
    button.type = 'button';
    button.dataset.runId = run.id;
    button.setAttribute('aria-current', String(run.id === state.runId));
    button.addEventListener('click', () => perform(() => loadRun(run.id)));
    item.append(button);
    return item;
  });
  if (!rows.length && !existing.length) {
    const empty = node('li', 'Aucun run trouvé.');
    empty.setAttribute('role', 'status');
    rows.push(empty);
  }
  byId('run-list').replaceChildren(...existing, ...rows);
  state.runOffset = data.nextOffset ?? 0;
  byId('run-more').hidden = !data.hasMore;
}

async function runList({ append = false } = {}) {
  const params = new URLSearchParams({ q: byId('run-query').value, status: byId('run-status-filter').value, limit: '20' });
  const search = params.toString();
  const extend = append && search === state.runSearch;
  params.set('offset', String(extend ? state.runOffset : 0));
  const epoch = state.epoch;
  byId('run-list').setAttribute('aria-busy', 'true');
  try {
    const data = await api.request(`/api/product-proofs/consumer-agents/${encoded(api.session.agent)}/runs?${params}`);
    renderRuns(data, extend);
    state.runSearch = search;
  } finally {
    if (epoch === state.epoch) byId('run-list').setAttribute('aria-busy', 'false');
  }
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
  api.timeoutMs = Number(document.body.dataset.requestTimeoutMs) || 10000;
  byId('token').value = '';
  clearView();
  window.dispatchEvent(new CustomEvent('studio:session', { detail: { reason: 'connect' } }));
  connectedShell(false);
  const success = await perform(async () => {
    const session = await api.request('/api/auth/session');
    api.session.permissions = session.user.permissions;
    showView('inspection');
    await discover();
    if (api.session.agent) await refresh();
  });
  if (success && api.session) {
    connectedShell(true);
    window.dispatchEvent(new Event('studio:ready'));
  }
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
  window.dispatchEvent(new CustomEvent('studio:session', { detail: { reason: 'scope' } }));
  await perform(async () => { await discover(); if (session.agent) await refresh(); window.dispatchEvent(new Event('studio:ready')); });
}

export function start() {
  byId('connection').addEventListener('submit', event => { event.preventDefault(); connect(); });
  byId('disconnect').addEventListener('click', disconnect);
  for (const id of ['organization', 'project', 'agent']) byId(id).addEventListener('change', changeScope);
  byId('refresh').addEventListener('click', () => perform(refresh, { preserveView: true }));
  byId('run-search').addEventListener('submit', event => { event.preventDefault(); perform(runList); });
  byId('run-more').addEventListener('click', () => perform(() => runList({ append: true })));
  byId('snapshot').addEventListener('click', () => perform(async () => {
    await api.request(`/api/workspaces/${encoded(state.current.workspace.id)}/snapshots`,
      { body: { label: 'Studio', reason: 'Operator capture' } });
    await refresh();
  }));
  byId('approval').addEventListener('submit', event => {
    event.preventDefault();
    perform(async () => {
      await api.request(`/api/execution-runs/${encoded(state.current.run.id)}/approve`,
        { body: approvalBody() });
      byId('approval-json').value = '';
      await refresh();
    });
  });
}

function approvalBody() {
  try { return JSON.parse(byId('approval-json').value); }
  catch (_) {
    throw Object.assign(new Error('Dossier d’approbation JSON invalide.'), { code: 'INVALID_APPROVAL_JSON' });
  }
}
