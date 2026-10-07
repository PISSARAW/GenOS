'use strict';

function validateUrl(value) {
  const url = new URL(value);
  assertCleanUrl(url);
  assertHttpsOrLoopback(url);
  return url.origin;
}

function assertCleanUrl(url) {
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('URL runtime invalide');
  }
}

function assertHttpsOrLoopback(url) {
  const allowedLoopback = ['localhost', '127.0.0.1', '[::1]'];
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && allowedLoopback.includes(url.hostname))) {
    throw new Error('HTTPS requis hors loopback');
  }
}

function validateSettings(settings) {
  const url = validateUrl(settings.url);
  for (const key of ['organization', 'project', 'workspace', 'agent']) {
    if (typeof settings[key] !== 'string' || !settings[key].trim()) throw new Error(`Champ requis : ${key}`);
  }
  return { ...settings, url };
}

class Client {
  constructor(settings, token) {
    this.settings = validateSettings(settings);
    this.token = token;
    this.integration = null;
  }

  async request(path, body) {
    const response = await fetch(`${this.settings.url}${path}`, { redirect: 'error',
      method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${this.token}`, 'X-Organization-Id': this.settings.organization,
        'X-Project-Id': this.settings.project, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined });
    const value = await response.json();
    if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(value.error || value)}`);
    return value;
  }

  async connect(clientId) {
    const contract = await this.request('/api/ide/contract');
    if (contract.contract !== 'genos.ide/v1' || contract.version !== '1.0.0') throw new Error('Contrat IDE incompatible');
    if (!contract.commands.some(command => command.id === 'workspace.inspect')) throw new Error('Inspection IDE indisponible');
    this.integration = await this.request('/api/ide/integrations', { ide: 'vscode', clientId,
      workspaceId: this.settings.workspace, version: '1.0.0', metadata: { extensionVersion: '1.0.0' } });
    return this.integration;
  }

  async inspect() {
    if (!this.integration) throw new Error('Connectez le workspace GenOS');
    const workspace = await this.request('/api/ide/commands/workspace.inspect', { integrationId: this.integration.id });
    const state = await this.request(`/api/product-proofs/consumer-agents/${encodeURIComponent(this.settings.agent)}/latest`);
    if (state.workspace.id !== this.settings.workspace) throw new Error('Agent hors du workspace connecté');
    await this.request(`/api/ide/integrations/${encodeURIComponent(this.integration.id)}/heartbeat`, {});
    const diagnostics = await this.request(`/api/ide/integrations/${encodeURIComponent(this.integration.id)}/diagnostics`);
    return { ...state, workspaceInspection: workspace.result, integration: diagnostics };
  }

  async disconnect() {
    if (!this.integration) return;
    await this.request(`/api/ide/integrations/${encodeURIComponent(this.integration.id)}/disconnect`, {});
    this.integration = null;
    this.token = '';
  }
}

module.exports = { Client, validateSettings };
