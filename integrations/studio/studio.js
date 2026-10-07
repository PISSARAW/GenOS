'use strict';

let session = null;
let current = null;
const byId = id => document.getElementById(id);

async function request(path, body) {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: { Authorization: `Bearer ${session.token}`, 'X-Organization-Id': session.organization,
      'X-Project-Id': session.project, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  const value = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(value.error || value)}`);
  return value;
}

function clearView() {
  current = null;
  byId('inspection').hidden = true;
  for (const id of ['run-id', 'run-status', 'workspace', 'promotion', 'provenance', 'steps', 'snapshots']) {
    byId(id).replaceChildren();
  }
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

async function refresh() {
  render(await request(`/api/product-proofs/consumer-agents/${encodeURIComponent(session.agent)}/latest`));
}

async function perform(action) {
  const buttons = [...document.querySelectorAll('button')];
  buttons.forEach(button => { button.disabled = true; });
  try { await action(); byId('message').textContent = 'État runtime chargé.'; }
  catch (error) { clearView(); byId('message').textContent = error.message; }
  finally { buttons.forEach(button => { button.disabled = false; }); }
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
