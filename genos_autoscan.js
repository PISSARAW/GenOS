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

const REPO = process.env.GENOS_REPO_ROOT || 'C:/Users/Shadow/Documents/GitHub/GenOS';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const ORCHESTRATE_CLI = path.join(REPO, 'backend', 'bin', 'genos-orchestrate.cjs');

// services backend
const db = require(path.join(REPO, 'backend', 'src', 'db'));
const dynamicOrganization = require(path.join(REPO, 'backend', 'src', 'services', 'dynamicOrganizationService'));
const { createOrchestratorId } = require(path.join(REPO, 'backend', 'src', 'services', 'orchestratorIdFactory'));

const TIMESTAMP = new Date().toISOString();
const HOST = process.env.COMPUTERNAME || process.env.HOSTNAME || 'unknown';

// ---------- helpers HTTP (évite curl MSYS bogué) ----------
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
  const allOk = results.every(r => r.ok);
  if (!allOk) {
    console.error('[HEALTH] Proches health échoués:', JSON.stringify(results));
    process.exit(2);
  }
  return results.map(r => ({ path: r.path.replace(BACKEND_URL, ''), status: r.status }));
}

// ---------- workers sans contexte de mission ----------
async function readOrganizationState(orchestratorId) {
  const database = await db.getDatabase();
  const requesterAgentId = orchestratorId;
  return dynamicOrganization.getStateForMember(database, orchestratorId, requesterAgentId);
}

async function readWorkerInbox(orchestratorId) {
  const database = await db.getDatabase();
  const requesterAgentId = orchestratorId;
  return dynamicOrganization.inbox(database, { orchestratorId, requesterAgentId, afterId: null, limit: 1000 });
}

// ---------- triage background ----------
function dispatchTriage(orchestratorId) {
  const { spawn } = require('child_process');
  const child = spawn('node', [ORCHESTRATE_CLI, JSON.stringify({
    mission: 'worker_inbox_triage',
    action: 'orchestrate',
    background: true,
    orchestratorId,
  })], {
    cwd: REPO,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, GENOS_ORCHESTRATOR_ID: orchestratorId },
  });
  child.unref();
  return child;
}

// ---------- exécution ----------
(async () => {
  console.log('[INFO] Démarrage scan GenOS —', HOST, TIMESTAMP);

  // 1. Health
  const health = await probeHealth();
  console.log('[INFO] Health backend OK —', JSON.stringify(health));

  // 2. Organisation state & inbox (appel direct, sans bridge mission)
  const orchestratorId = createOrchestratorId('mcp_orchestrator_autoscan') || 'mcp_orchestrator_autoscan';

  let orgState, inbox;
  try {
    orgState = await readOrganizationState(orchestratorId);
  } catch (e) {
    console.error('[ORG] Échec organisation_state:', e && e.message);
    process.exit(3);
  }
  try {
    inbox = await readWorkerInbox(orchestratorId);
  } catch (e) {
    console.error('[INBOX] Échec worker_inbox:', e && e.message);
    process.exit(3);
  }

  if (!orgState || typeof orgState !== 'object') {
    console.error('[ORG] Réponse malformée:', JSON.stringify(orgState));
    process.exit(4);
  }
  if (!inbox || typeof inbox !== 'object') {
    console.error('[INBOX] Réponse malformée:', JSON.stringify(inbox));
    process.exit(4);
  }

  console.log('[INFO] organisation_state:', JSON.stringify({ organization: orgState.organization, version: orgState.version }));

  const messages = Array.isArray(inbox.messages) ? inbox.messages : [];
  const unread = messages.filter(m => m && m.read === false).length;
  const total = messages.length;
  console.log(`[INFO] Boîte worker: ${total} message(s), ${unread} non lu(s)`);
  if (messages.length) {
    console.log('[INFO] Détail messages:');
    messages.forEach((m, i) => console.log(`  [${i}] ${m.kind || 'n/a'} — read=${!!m.read} — ${m.summary || JSON.stringify(m).slice(0,120)}`));
  }

  // 3. Décision
  if (unread > 0) {
    console.log('[INFO] Messages non lus détectés — lancement triage worker_inbox_triage en background');
    dispatchTriage(orchestratorId);
    console.log(JSON.stringify({
      scan_time: TIMESTAMP,
      host: HOST,
      health,
      org_state: { organization: orgState.organization, version: orgState.version },
      unread_count: unread,
      total_count: total,
      action: 'triage_dispatched',
    }, null, 2));
  } else {
    console.log('[INFO] Tout clair.');
    console.log(JSON.stringify({
      scan_time: TIMESTAMP,
      host: HOST,
      health,
      org_state: { organization: orgState.organization, version: orgState.version },
      unread_count: 0,
      total_count: 0,
      action: 'tout_clair',
    }, null, 2));
  }
})().catch(err => {
  console.error('[ERREUR] Scan échoué:', err && err.stack ? err.stack : err);
  process.exit(9);
});
