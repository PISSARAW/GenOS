import { api, perform } from './app.mjs';
import { byId, encoded } from './ui.mjs';
import { actionForm } from './forms.mjs';
import { managementActions } from './managementActions.mjs';

const reads = {
  agents: () => '/api/agents',
  workspaces: () => '/api/workspaces',
  organizations: () => '/api/control-plane/organizations',
  projects: () => '/api/control-plane/projects',
  members: () => '/api/control-plane/organizations/' + encoded(api.session.organization) + '/members',
  workers: () => '/api/control-plane/workers',
  garage: () => '/api/agents/' + encoded(api.session.agent) + '/workers/garage',
  queue: () => '/api/agents/' + encoded(api.session.agent) + '/workers/garage/queue'
};

export function startManagement() {
  for (const action of managementActions) actionForm(action, byId('management-actions'));
  byId('management-read').addEventListener('submit', event => {
    event.preventDefault();
    perform(async () => {
      const data = await api.request(reads[byId('management-collection').value]());
      byId('management-data').textContent = JSON.stringify(data, null, 2);
    });
  });
  byId('terminal').addEventListener('submit', event => {
    event.preventDefault();
    const command = byId('terminal-command').value;
    if (['halt', 'abort'].includes(command) && !window.confirm('Bloquer les nouveaux appels MCP pour ce backend ?')) return;
    perform(async () => {
      const data = await api.request('/api/terminal', { body: { command } });
      byId('terminal-output').textContent = data.output;
    });
  });
}
