'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Charge les credentials Nous OAuth depuis le fichier auth.json d'Hermes.
 * Hermes les stocke dans $LOCALAPPDATA/hermes/auth.json (pas ~/.hermes/).
 */
function loadNousCredentials() {
  return parseNousCredentials(readAuthFile());
}

function readAuthFile() {
  const roots = [path.join(os.homedir(), '.hermes')];
  const appData = process.env.LOCALAPPDATA || process.env.APPDATA;
  if (appData) roots.push(path.join(appData, 'hermes'));
  for (const root of roots) {
    const authPath = path.join(root, 'auth.json');
    try { return { authPath, raw: fs.readFileSync(authPath, 'utf8') }; } catch (_) {}
  }
  return null;
}

function parseNousCredentials(file) {
  if (!file) return { accessToken: null, authPath: null, found: false };
  let auth;
  try { auth = JSON.parse(file.raw); } catch (error) { return { accessToken: null, authPath: file.authPath, parseError: error.message }; }
  const nous = auth.providers?.nous;
  if (!nous?.access_token) return { accessToken: null, authPath: file.authPath, providerFound: false };
  return {
    accessToken: nous.access_token,
    agentKey: nous.agent_key || null,
    authPath: file.authPath,
    providerFound: true,
    expiresAt: nous.expires_at || null,
    tokenType: nous.token_type || 'Bearer'
  };
}

const credentials = loadNousCredentials();

function createContext(mission, emit) {
  const toolLease = parseMissionField(mission, 'toolLeaseJson', []);
  const toolNames = new Set(toolLease);
  const executionBudget = parseMissionField(mission, 'executionBudgetJson', {});

  return {
    mission,
    prompt: mission.prompt || mission.currentTask || 'Aucune tâche fournie.',
    emit,
    toolLease,
    model: process.env.GENOS_SOLAR_MODEL || 'solar-pro4:free',
    abortController: new AbortController(),
    startedAt: Date.now(),
    tokensUsed: 0,
    executionBudget,
    workspaceRoot: path.resolve(mission.workspaceRoot || process.cwd()),
    allowFileEdits: parseMissionField(mission, 'executionPolicyJson', {}).allowFileEdits === true,
    credentials,
    observedTools: toolNames || new Set(),
    recordedTurns: [],
    silentUpdates: mission.silentUpdates === true,
    toolNames
  };
}

function parseMissionField(mission, key, fallback) {
  const directKey = key.replace(/Json$/, '');
  if (mission[directKey] && typeof mission[directKey] === 'object') return mission[directKey];
  try {
    const value = JSON.parse(mission[key] || JSON.stringify(fallback));
    return value && typeof value === 'object' ? value : fallback;
  } catch (_) {
    return fallback;
  }
}

async function finishContext(state, text) {
  state.emit({
    eventType: 'AGENT_TASK_COMPLETED',
    action: 'COMPLETE',
    detail: 'Mission terminée par Solar-direct.',
    status: 'completed',
    text
  });
  return { text, estimatedTokens: state.estimatedTokens };
}

module.exports = { createContext, finishContext, credentials };
