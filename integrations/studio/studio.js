'use strict';

let session = null;
let current = null;
let busy = false;
const REQUEST_TIMEOUT_MS = 10000;
const byId = id => document.getElementById(id);

function errorMessage(error) {
  if (error.name === 'AbortError') return 'Le backend n’a pas répondu dans le délai imparti.';
  if (error instanceof SyntaxError) return 'Réponse backend invalide (JSON attendu).';
  if (error instanceof TypeError) return 'Backend inaccessible. Vérifiez la connexion réseau.';
  return error.message;
}

async function request(path, body) {
  if (!session) throw new Error('Session absente. Connectez-vous à nouveau.');
  const controller = new AbortController();
  const timeoutMs = Number(document.body.dataset.requestTimeoutMs) || REQUEST_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, { method: body ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal,
      headers: { Authorization: `Bearer ${session.token}`, 'X-Organization-Id': session.organization,
        'X-Project-Id': session.project, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined });
    const value = await response.json();
    if (!response.ok) {
      const error = new Error(`${response.status} ${JSON.stringify(value.error || value)}`);
      error.status = response.status;
      throw error;
    }
    return value;
  } finally { clearTimeout(timeout); }
}

function clearView() {
  current = null;
  byId('inspection').hidden = true;
  for (const id of ['run-id', 'run-status', 'workspace', 'promotion', 'provenance', 'steps', 'snapshots', 'run-list']) {
    byId(id).replaceChildren();
  }
}

function renderRuns(data) {
  byId('run-list').replaceChildren(...data.runs.map(run => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${run.id} · ${run.status}`;
    button.addEventListener('click', () => perform(() => loadRun(run.id)));
    item.append(button);
    return item;
  }));
}

function render(data) {
  current = data;
  byId('run-id').textContent = data.run.id;
  byId('run-status').textContent = `État : ${data.run.status}`;
  byId('workspace').textContent = `Workspace : ${data.workspace.id} · ${data.workspace.name}`;
  byId('promotion').textContent = data.promotion ? `Journal vérifié : ${data.promotion.phase}` : 'Aucune promotion journalisée';
  byId('provenance').textContent = JSON.stringify(data.provenance, null, 2);
  byId('steps').replaceChildren(...data.run.steps.map(step => {
    const row = document.createElement('tr');
    for (const text of [step.stageKey, step.status]) {
      const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
    }
    return row;
  }));
  byId('snapshots').replaceChildren(...data.snapshots.map(snapshot => {
    const item = document.createElement('li'); item.textContent = `${snapshot.id} · ${snapshot.label}`; return item;
  }));
  byId('inspection').hidden = false;
}

async function loadRun(runId) {
  render(await request(`/api/product-proofs/consumer-runs/${encodeURIComponent(runId)}`));
}

async function refreshRuns() {
  const query = encodeURIComponent(byId('run-query').value);
  const status = encodeURIComponent(byId('run-status-filter').value);
  renderRuns(await request(`/api/product-proofs/consumer-agents/${encodeURIComponent(session.agent)}/runs?q=${query}&status=${status}`));
}

async function refresh() {
  await Promise.all([request(`/api/product-proofs/consumer-agents/${encodeURIComponent(session.agent)}/latest`).then(render), refreshRuns()]);
}

async function perform(action) {
  if (busy) return;
  busy = true;
  const buttons = [...document.querySelectorAll('button')];
  buttons.forEach(button => { button.disabled = true; });
  byId('message').textContent = 'Chargement de l’état runtime…';
  try { await action(); byId('message').textContent = 'État runtime chargé.'; }
  catch (error) {
    if (error.status === 401) {
      session = null;
      byId('token').value = '';
      clearView();
      byId('message').textContent = 'Session expirée. Reconnectez-vous.';
    } else {
      clearView();
      byId('message').textContent = errorMessage(error);
    }
  } finally { busy = false; buttons.forEach(button => { button.disabled = false; }); }
}

byId('connection').addEventListener('submit', event => {
  event.preventDefault(); clearView();
  session = { token: byId('token').value, organization: byId('organization').value,
    project: byId('project').value, agent: byId('agent').value };
  byId('token').value = '';
  perform(refresh);
});
byId('disconnect').addEventListener('click', () => {
  session = null; clearView(); byId('token').value = ''; byId('approval-json').value = '';
  byId('message').textContent = 'Déconnecté.';
});
byId('refresh').addEventListener('click', () => perform(refresh));
byId('run-search').addEventListener('submit', event => { event.preventDefault(); perform(refreshRuns); });
byId('snapshot').addEventListener('click', () => perform(async () => {
  await request(`/api/workspaces/${encodeURIComponent(current.workspace.id)}/snapshots`, { label: 'Studio', reason: 'Operator capture' });
  await refresh();
}));
byId('approval').addEventListener('submit', event => {
  event.preventDefault();
  perform(async () => {
    const body = JSON.parse(byId('approval-json').value);
    await request(`/api/execution-runs/${encodeURIComponent(current.run.id)}/approve`, body);
    byId('approval-json').value = ''; await refresh();
  });
});
