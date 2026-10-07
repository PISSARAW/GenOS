import { api } from './app.mjs';
import { byId, encoded } from './ui.mjs';

const control = '/api/control-plane';
const agent = () => '/api/agents/' + encoded(api.session.agent);
const organization = () => control + '/organizations/' + encoded(api.session.organization);
const project = () => control + '/projects/' + encoded(api.session.project);
const workspaceId = () => byId('workspace-choice').value;
const name = ['name', 'Nom'];
const principal = ['principalId', 'Identifiant du membre'];
const memberRole = ['role', 'Rôle du membre'];

export const managementActions = [
  { id: 'organization-create', title: 'Créer une organisation', path: () => control + '/organizations', fields: [name] },
  { id: 'project-create', title: 'Créer un projet', path: () => control + '/projects', fields: [name],
    body: input => ({ ...input, organizationId: api.session.organization }) },
  { id: 'project-update', title: 'Modifier le projet', method: 'PATCH', path: project,
    fields: [name, ['status', 'État : active ou archived', 'text', true, 'active']] },
  { id: 'project-delete', title: 'Supprimer le projet', method: 'DELETE', path: project, permission: 'workspace:delete',
    confirm: 'Supprimer le projet sélectionné et ses workspaces ? Cette suppression est définitive.',
    body: () => ({ confirmed: true }) },
  { id: 'project-restore', title: 'Réactiver le projet archivé', path: () => project() + '/restore', fields: [] },
  { id: 'organization-member', title: 'Attribuer un rôle dans l’organisation', path: () => organization() + '/members',
    fields: [principal, memberRole] },
  { id: 'organization-member-delete', title: 'Retirer un membre de l’organisation', method: 'DELETE',
    path: input => organization() + '/members/' + encoded(input.principalId), fields: [principal],
    confirm: 'Retirer ce membre de l’organisation sélectionnée ?' },
  { id: 'project-member', title: 'Attribuer un rôle dans le projet', path: () => project() + '/members',
    fields: [principal, memberRole] },
  { id: 'project-member-delete', title: 'Retirer un membre du projet', method: 'DELETE',
    path: input => project() + '/members/' + encoded(input.principalId), fields: [principal],
    confirm: 'Retirer ce membre du projet sélectionné ?' },
  { id: 'workspace-create', title: 'Créer un workspace', path: () => '/api/workspaces',
    fields: [name, ['language', 'Langage', 'text', true, 'JavaScript'], ['description', 'Description', 'textarea', false]],
    body: input => ({ ...input, visibility: 'Private' }) },
  { id: 'agent-create', title: 'Déployer un agent', path: () => '/api/deploy',
    fields: [name, ['prompt', 'Mission', 'textarea'], ['executionMode', 'Mode : orchestrator ou worker', 'text', true, 'worker'],
      ['parentAgentId', 'Orchestrateur parent', 'text', false], ['agentType', 'Runtime', 'text', true, 'GenOS']],
    body: input => ({ ...input, workspaceId: workspaceId() }) },
  { id: 'agent-start', title: 'Démarrer l’agent sélectionné', path: () => agent() + '/start',
    fields: [['prompt', 'Mission', 'textarea']] },
  { id: 'agent-stop', title: 'Demander l’arrêt de l’agent', path: () => agent() + '/stop', fields: [],
    confirm: 'Demander l’arrêt de l’agent sélectionné ?' },
  { id: 'agent-delete', title: 'Supprimer l’agent sélectionné', method: 'DELETE', path: agent, fields: [],
    confirm: 'Supprimer l’agent sélectionné ? Cette suppression est définitive.' },
  { id: 'agent-fork', title: 'Fork de l’agent sélectionné', path: () => '/api/command', fields: [],
    body: () => ({ action: 'fork_agent', agentId: api.session.agent }) },
  { id: 'worker-dispatch', title: 'Dispatcher un worker', path: input => agent() + '/workers/' + encoded(input.workerId) + '/dispatch',
    fields: [['workerId', 'Worker'], ['prompt', 'Mission du worker', 'textarea']],
    body: input => ({ prompt: input.prompt, requestId: crypto.randomUUID(), queueIfFull: true }) },
  { id: 'worker-control', title: 'Contrôler une demande en file',
    path: input => agent() + '/workers/garage/queue/' + encoded(input.requestId) + '/' + encoded(input.action),
    fields: [['requestId', 'Identifiant de demande'], ['action', 'Action : cancel, resume, freeze ou renew']],
    confirm: 'Appliquer cette action à la demande sélectionnée ?' }
];
