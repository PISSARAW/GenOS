#!/usr/bin/env node
/**
 * GenOS autoscan (cron) — healthz/readyz/livez + organisation_state + worker_inbox.
 * Si messages non lus → lance genos_orchestrate mission=worker_inbox_triage en background.
 * Sinon → "Tout clair".
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

// Import différé pour éviter le cycle db↔services au chargement.
function getDb() { return require(path.join(REPO, 'backend', 'src', 'db')).getDatabase(); }
function getDynamicOrg() { return require(path.join(REPO, 'backend', 'src', 'services', 'dynamicOrganizationService')); }

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
    throw new Error(`Health probes failed: ${JSON.stringify(results.map(r => ({ status: r.status, error: r.error })))}`);
  }
  return results.map(r => ({ status: r.status }));
}

function ensureOrchestrator(db, orchestratorId) {
  return db.run(
    `INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, model_tier, isolation_mode, current_task)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    orchestratorId,
    'Autoscan Cron',
    'Scanner',
    'idle',
    'orchestrator',
    'frontier',
    'Branch',
    'Health + inbox check'
  );
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

(async function main() {
  console.log('[INFO] Démarrage scan GenOS —', HOST, TIMESTAMP);

  let health, orgState, inbox;
  try {
    health = await probeHealth();
    console.log('[INFO] Health backend OK —', JSON.stringify(health));
  } catch (e) {
    bail('HEALTH', { error: e.message || e }, 2);
  }

  const orchestratorId = 'mcp_orchestrator_autoscan_' + require('crypto').randomUUID().slice(0, 8);

  try {
    const db = await getDb();
    await ensureOrchestrator(db, orchestratorId);
    const dynamicOrg = getDynamicOrg();
    orgState = await dynamicOrg.getState(db, orchestratorId);
    if (!orgState) {
      await dynamicOrg.changeOrganization(db, { orchestratorId, organization: 'specialist_expert_committee', reason: 'Autoscan initialisation' });
      orgState = await dynamicOrg.getState(db, orchestratorId);
    }
  } catch (e) {
    bail('ORG', { error: e.message || e, orchestratorId }, 3);
  }

  try {
    const db = await getDb();
    const dynamicOrg = getDynamicOrg();
    inbox = await dynamicOrg.inbox(db, { orchestratorId, requesterAgentId: orchestratorId, limit: 1000 });
  } catch (e) {
    bail('INBOX', { error: e.message || e, orchestratorId }, 3);
  }

  if (!orgState || typeof orgState !== 'object') bail('ORG', orgState, 4);
  if (!inbox || typeof inbox !== 'object') bail('INBOX', inbox, 4);

  const messages = Array.isArray(inbox.messages) ? inbox.messages : [];
  const unread = messages.filter(m => m && m.read === false).length;
  const total = messages.length;

  console.log('[INFO] organisation_state:', JSON.stringify({ organization: orgState.organization, version: orgState.version }));
  console.log(`[INFO] Boîte worker: ${total} message(s), ${unread} non lu(s)`);
  messages.forEach((m, i) => console.log(`  [${i}] ${m.kind || 'n/a'} — read=${!!m.read} — ${(m.content || JSON.stringify(m)).slice(0, 120)}`));

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
