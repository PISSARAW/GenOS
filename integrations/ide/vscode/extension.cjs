'use strict';

const vscode = require('vscode');
const crypto = require('node:crypto');
const { Client, validateSettings } = require('./client.cjs');

async function promptSettings(previous) {
  const settings = {};
  for (const key of ['url', 'organization', 'project', 'workspace', 'agent']) {
    const value = await vscode.window.showInputBox({ prompt: `GenOS · ${key}`, value: previous?.[key] });
    if (!value) return null;
    settings[key] = value;
  }
  return validateSettings(settings);
}

class Session {
  constructor(context) { this.context = context; this.client = null; this.timer = null; }

  async configure(settings, token) {
    const checked = validateSettings(settings);
    if (this.client?.integration) await this.disconnect();
    await this.context.secrets.store('genos.runtime-token', token);
    await this.context.globalState.update('genos.settings', checked);
  }

  async credentials() {
    const settings = this.context.globalState.get('genos.settings') || await promptSettings();
    if (!settings) return null;
    const token = await this.context.secrets.get('genos.runtime-token')
      || await vscode.window.showInputBox({ prompt: 'Clé d’accès GenOS', password: true, ignoreFocusOut: true });
    return token ? { settings, token } : null;
  }

  async configureFromInput() {
    const settings = await promptSettings(this.context.globalState.get('genos.settings'));
    if (!settings) return;
    const token = await vscode.window.showInputBox({ prompt: 'Clé d’accès GenOS', password: true, ignoreFocusOut: true });
    if (token) await this.configure(settings, token);
  }

async connect() {
    const credentials = await this.credentials();
    if (!credentials) return;
    const { settings, token } = credentials;
    await this.configure(settings, token);
    const clientId = await this.resolveClientId(settings);
    this.client = new Client(settings, token);
    const result = await this.client.connect(clientId);
    this.startHeartbeat(result.id);
    return result;
  }

  async resolveClientId(settings) {
    const identityKey = `genos.client.${settings.url}.${settings.organization}.${settings.project}.${settings.workspace}`;
    const clientId = this.context.globalState.get(identityKey) || crypto.randomUUID();
    await this.context.globalState.update(identityKey, clientId);
    return clientId;
  }

  startHeartbeat(integrationId) {
    this.timer = setInterval(() => this.client?.request(`/api/ide/integrations/${encodeURIComponent(integrationId)}/heartbeat`, {})
      .catch(() => clearInterval(this.timer)), 60000);
    this.timer.unref();
  }

  async inspect() {
    if (!this.client) throw new Error('Utilisez GenOS: Connecter le workspace');
    const state = await this.client.inspect();
    const document = await vscode.workspace.openTextDocument({ language: 'json', content: JSON.stringify(state, null, 2) });
    await vscode.window.showTextDocument(document, { preview: true });
    return state;
  }

  async disconnect() {
    clearInterval(this.timer);
    if (this.client) await this.client.disconnect();
    this.client = null;
    await this.context.secrets.delete('genos.runtime-token');
  }
}

function register(context, command, action) {
  context.subscriptions.push(vscode.commands.registerCommand(command, async () => {
    try { return await action(); }
    catch (error) { vscode.window.showErrorMessage(error.message); throw error; }
  }));
}

function activate(context) {
  const session = new Session(context);
  register(context, 'genos.connect', () => session.connect());
  register(context, 'genos.inspect', () => session.inspect());
  register(context, 'genos.disconnect', () => session.disconnect());
  register(context, 'genos.configure', () => session.configureFromInput());
  context.subscriptions.push({ dispose() { clearInterval(session.timer); } });
  return { configure: (settings, token) => session.configure(settings, token) };
}

module.exports = { activate };
