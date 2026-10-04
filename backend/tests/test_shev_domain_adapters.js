'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const fixture = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { compilePending } = require('../src/services/shev/initiativeService');
const { inspectDataFreshness, verifyDataFreshness } = require('../src/services/shev/adapters/dataFreshnessAdapter');
const { inspectJsonContract, verifyJsonContract } = require('../src/services/shev/adapters/jsonContractAdapter');

const projectId = 'shev-domains';

async function markDone(db, observationId) {
  await compilePending(db, { projectId });
  const row = await db.get('SELECT * FROM shev_initiatives WHERE observation_id = ?', [observationId]);
  assert.equal(row.status, 'queued');
  await db.run("UPDATE ontogenesis_backlog SET status = 'done' WHERE id = ?", [row.task_id]);
  return row;
}

async function main() {
  const db = await fixture.memoryDb();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shev-domains-'));
  try {
    await store.createProject(db, { id: projectId, rootPath: root, branch: 'codex/test',
      objective: 'Observer deux domaines', config: fixture.testConfig() });
    await registerResponsibility(db, { projectId, authorityRef: 'owner:test',
      mandate: { purpose: 'Observer deux domaines', autoDiagnose: true, autoInstrument: false,
        dimensions: [{ name: 'freshness', expected: 'Donnees recentes', acceptance: ['Age sous seuil.'] },
          { name: 'contract', expected: 'Configuration saine', acceptance: ['Statut healthy.'] }] } });

    const dataPath = path.join(root, 'data.csv');
    fs.writeFileSync(dataPath, 'sample\n');
    const old = new Date(Date.now() - 7200000);
    fs.utimesSync(dataPath, old, old);
    const freshness = { projectId, relativePath: 'data.csv', dimension: 'freshness', maxAgeMs: 3600000 };
    const beforeData = await inspectDataFreshness(db, { ...freshness, nowMs: Date.now() - 10000 });
    assert.equal(beforeData.kind, 'degradation');
    const dataInitiative = await markDone(db, beforeData.id);
    fs.utimesSync(dataPath, new Date(), new Date());
    const dataEffect = await verifyDataFreshness(db, { ...freshness, initiativeId: dataInitiative.id });
    assert.equal(dataEffect.project_result, 'confirmed');

    const jsonPath = path.join(root, 'config.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ status: 'broken' }));
    const expectedSha256 = createHash('sha256').update(JSON.stringify('healthy')).digest('hex');
    const contract = { projectId, relativePath: 'config.json', dimension: 'contract',
      pointer: '/status', expectedSha256 };
    const beforeJson = await inspectJsonContract(db, { ...contract, nowMs: Date.now() - 10000 });
    assert.equal(beforeJson.kind, 'degradation');
    const jsonInitiative = await markDone(db, beforeJson.id);
    fs.writeFileSync(jsonPath, JSON.stringify({ status: 'healthy' }));
    const jsonEffect = await verifyJsonContract(db, { ...contract, initiativeId: jsonInitiative.id });
    assert.equal(jsonEffect.project_result, 'confirmed');
    await assert.rejects(inspectJsonContract(db, { ...contract, relativePath: '../escape.json' }), /path|travers/i);
    console.log('SHEV data and application contract adapters passed.');
  } finally {
    await db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
