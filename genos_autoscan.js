#!/usr/bin/env node
/**
 * GenOS autoscan — vérification de l'état du système sans traverser
 * le bridge Mission (qui exige un budget/plan d'autonomie complet).
 *
 * Health backend (healthz/readyz/livez) + organisation_state + worker_inbox
 * appelés directement via les services backend (dynamicOrganization).
 *
 * Si messages non lus existent → lance genos_orchestrate mission=worker_inbox_triage
 * en background. Sinon → "Tout clair".
 */
'use strict';

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const REPO = process.env.GENOS_REPO_ROOT || 'C:/Users/Shadow/Documents/GitHub/GenOS';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const ORCHESTRATE_CLI = path.join(REPO, 'backend', 'bin', 'genos-orchestrate.cjs');

const TIMESTAMP = new Date().toISOString();
const HOST = process.env.COMPUTERNAME || process.env.HOSTNAME || 'unknown';

// ---------- services backend ----------
const db = require(path.join(REPO, 'backend', 'src', 'db'));
const dynamicOrganization = require(path.join(REPO, 'backend', 'src', 'services', 'dynamicOrganizationService'));
const { createOrchestratorId } = require(path.join(REPO, 'backend', 'src', 'services', 'orchestratorIdFactory'));

function httpGet(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ ok: res.statusCode === 200, status: res.statusCode, body }));
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
  });
}

async function probeHealth() {
  const results = await Promise.all([
    httpGet(`${BACKEND_URL}/healthz`),
    httpGet(`${BACKEND_URL}/readyz`),
    httpGet(`${BACKEND_URL}/livez`),
  ]);
  if (results.some(r => !r.ok)) {
    console.error('[HEALTH] Proches health échoués:', JSON.stringify(results));
    process.exit(2);
  }
  return results.map(r => ({ status: r.status }));
}

async function readOrganizationState(orchestratorId) {
  const database = await db.getDatabase();
  return dynamicOrganization.getStateForMember(database, orchestratorId, orchestratorId);
}

async function readWorkerInbox(orchestratorId) {
  const database = await db.getDatabase();
  return dynamicOrganization.inbox(database, { orchestratorId, requesterAgentId: orchestratorId, afterId: null, limit: 1000 });
}

function dispatchTriage(orchestratorId) {
  spawn('node', [ORCHESTRATE_CLI, JSON.stringify({
    mission: 'worker_inbox_triage',
    action: 'orchestrate',
    background: true,
    orchestratorId,
  })], {
    cwd: REPO,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, GENOS_ORCHESTRATOR_ID: orchestratorId },
  }).unref();
}

function bail(label, payload, code) {
  console.error(`[${label}]`, JSON.stringify(payload));
  process.exit(code);
}

// ---------- point d'entrée ----------
(async function main() {
  console.log('[INFO] Démarrage scan GenOS —', HOST, TIMESTAMP);

  let health, orgState, inbox;
  try {
    health = await probeHealth();
    console.log('[INFO] Health backend OK');
  } catch (e) {
    bail('HEALTH', e && e.message || e, 2);
  }

  const orchestratorId = createOrchestratorId('mcp_orchestrator_autoscan') || 'mcp_orchestrator_autoscan';

  try {
    orgState = await readOrganizationState(orchestratorId);
  } catch (e) {
    if (e && e.message && e.message.includes('was not found')) {
      console.log('[INFO] Orchestrateur autoscan absent — création auto');
      const database = await db.getDatabase();
      await database.run(
        `INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, model_tier, isolation_mode, current_task)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        orchestratorId,
        'Autoscan',
        'Scanner',
        'idle',
        'orchestrator',
        'frontier',
        'Branch',
        'Health + inbox check'
      );
      orgState = await readOrganizationState(orchestratorId);
    } else {
      bail('ORG', e && e.message || e, 3);
    }
  }

  try {
    inbox = await readWorkerInbox(orchestratorId);
  } catch (e) {
    bail('INBOX', e && e.message || e, 3);
  }

  const messages = Array.isArray(inbox.messages) ? inbox.messages : [];
  const unread = messages.filter(m => m && m.read === false).length;
  const total = messages.length;

  if (!orgState || typeof orgState !== 'object') bail('ORG', orgState, 4);
  if (!inbox || typeof inbox !== 'object') bail('INBOX', inbox, 4);

  console.log('[INFO] organisation_state:', JSON.stringify({ organization: orgState.organization, version: orgState.version }));
  console.log(`[INFO] Boîte worker: ${total} message(s), ${unread} non lu(s)`);
  messages.forEach((m, i) => console.log(`  [${i}] ${m.kind || 'n/a'} — read=${!!m.read} — ${(m.summary || JSON.stringify(m)).slice(0,120)}`));

  const report = {
    scan_time: TIMESTAMP,
    host: HOST,
    health,
    org_state: { organization: orgState.organization, version: orgState.version },
    unread_count: unread,
    total_count: total,
    action: unread > 0 ? 'triage_dispatched' : 'tout_clair',
  };

  if (unread > 0) {
    console.log('[INFO] Messages non lus détectés — lancement triage worker_inbox_triage en background');
    dispatchTriage(orchestratorId);
  } else {
    console.log('[INFO] Tout clair.');
  }
  console.log(JSON.stringify(report, null, 2));
})().catch(err => {
  console.error('[ERREUR] Scan échoué:', err && err.stack ? err.stack : err);
  process.exit(9);
});
