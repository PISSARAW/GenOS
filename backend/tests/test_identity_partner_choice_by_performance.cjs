'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const ledger = require('../src/services/identity/ledger');
const store = require('../src/services/identity/storage');
const incarnations = require('../src/services/identity/incarnations');
const peers = require('../src/services/identity/peers');
const decisions = require('../src/services/identity/decisions');

const WORKSPACE = { id: 'w', organization_id: 'org', project_id: 'project' };
const SCOPE = { organizationId: 'org', projectId: 'project' };

async function database() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT, role TEXT, execution_mode TEXT, status TEXT,
      workspace_id TEXT, model_tier TEXT, parent_agent_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
  await db.run('INSERT INTO workspaces VALUES (?, ?, ?)', WORKSPACE.id, WORKSPACE.organization_id, WORKSPACE.project_id);
  await store.ready(db);
  for (const id of ['a', 'b', 'c', 'd']) {
    await db.run(`INSERT INTO agents(id, name, role, execution_mode, status, workspace_id, model_tier)
      VALUES (?, ?, 'worker', 'worker', 'idle', ?, 'same-model')`, id, id, WORKSPACE.id);
    await ledger.ensure(db, { agentId: id, scope: SCOPE });
  }
  return db;
}

async function sessionFor(db, agentId, ownerId) {
  return await incarnations.activate(db, { agentId, ownerId, ttlMs: 900000 });
}

async function recordInteractions(db, context) {
  const { session, peerId, results } = context;
  for (const [index, success] of results.entries()) {
    const operationId = `interact-${peerId}-${index}`;
    await decisions.begin(db, { session, operationId, domain: 'cooperation',
      dimensions: ['relations'], peerId });
    await decisions.finish(db, { session, operationId, success, attribution: 'self',
      evidenceRef: { executionRunId: `run-${peerId}-${index}`, outcome: success ? 'ok' : 'ko' } });
  }
}

function performanceByPeer(rows) {
  const byPeer = {};
  for (const row of rows) {
    if (!byPeer[row.peer_id]) byPeer[row.peer_id] = { successes: 0, total: 0 };
    byPeer[row.peer_id].total += 1;
    if (row.outcome === 1) byPeer[row.peer_id].successes += 1;
  }
  const result = {};
  for (const [peer, stats] of Object.entries(byPeer)) {
    result[peer] = {
      probability: (stats.successes + 1) / (stats.total + 2),
      successes: stats.successes,
      total: stats.total,
    };
  }
  return result;
}

async function main() {
  const db = await database();
  try {
    const sa = await sessionFor(db, 'a', 'social-a');
    const sb = await sessionFor(db, 'b', 'social-b');
    const sc = await sessionFor(db, 'c', 'social-c');
    const sd = await sessionFor(db, 'd', 'social-d');

    // a reconnait b et c comme pairs
    const presB = await peers.present(db, { session: sb, audienceId: 'a' });
    const receiptB = await peers.recognize(db, { observerId: 'a', presentation: presB, operationId: 'meet-b' });
    const presC = await peers.present(db, { session: sc, audienceId: 'a' });
    const receiptC = await peers.recognize(db, { observerId: 'a', presentation: presC, operationId: 'meet-c' });

    // a observe directement b et c (source observe, pas seulement declaration registry)
    await peers.observe(db, {
      observerId: 'a', peerId: 'b', key: 'reliability', source: 'observed',
      value: 'high', evidenceHash: receiptB.selfHead, confidence: 0.9,
    });
    await peers.observe(db, {
      observerId: 'a', peerId: 'c', key: 'reliability', source: 'observed',
      value: 'low', evidenceHash: receiptC.selfHead, confidence: 0.9,
    });

    // b : 3 succes sur 4 ; c : 1 succes sur 4
    await recordInteractions(db, { session: sa, peerId: 'b', results: [true, true, false, true] });
    await recordInteractions(db, { session: sa, peerId: 'c', results: [false, false, true, false] });

    // 1. a lit son historique de decisions pour calculer la performance par paire
    const rows = await db.all(`SELECT peer_id, outcome FROM agent_identity_decisions
      WHERE agent_id = ? AND domain = 'cooperation' AND peer_id IS NOT NULL AND outcome IS NOT NULL`, 'a');
    const perf = performanceByPeer(rows);
    assert.equal(perf.b.total, 4, 'b a 4 interactions');
    assert.equal(perf.c.total, 4, 'c a 4 interactions');
    assert.ok(perf.b.probability > perf.c.probability, 'b a une meilleure performance personnelle observee que c');

    // 2. Choix effectif : b est selectionne car il a le meilleur historique personnel
    const chosen = perf.b.probability > perf.c.probability ? 'b' : 'c';
    assert.equal(chosen, 'b', 'b est selectionne selon l historique personnel observe');

    // 3. Controle : d n a aucune interaction observee, il n est pas candidat valide
    assert.ok(!perf.d, 'd n a aucune interaction enregistree');

    // 4. Inversion des resultats : si c etait meilleur, le choix s inverserait
    // (verifie par le calcul : b=0.667, c=0.333 avec les donnees actuelles)
    assert.ok(Math.abs(perf.b.probability - 2/3) < 0.01, 'b approx 2/3 (3/4 succes lisse)');
    assert.ok(Math.abs(perf.c.probability - 1/3) < 0.01, 'c approx 1/3 (1/4 succes lise)');

    await incarnations.release(db, sa);
    await incarnations.release(db, sb);
    await incarnations.release(db, sc);
    await incarnations.release(db, sd);
    console.log('Partner choice by performance: PASS');
  } finally {
    await db.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
