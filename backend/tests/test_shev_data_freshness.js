'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fixture = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { inspectDataFreshness } = require('../src/services/shev/adapters/dataFreshnessAdapter');
const { tickOnce } = require('../src/services/ontogenesis/tickService');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shev-data-'));
  const db = await fixture.memoryDb();
  const nowMs = Date.now();
  try {
    await store.createProject(db, { id: 'pipeline-a', rootPath: root, branch: 'codex/ontogenesis',
      objective: 'maintenir la fraicheur des donnees', config: fixture.testConfig() });
    await registerResponsibility(db, { projectId: 'pipeline-a', authorityRef: 'delegation:pipeline-a',
      mandate: { purpose: 'Maintenir les donnees a jour', autoDiagnose: true, autoInstrument: true,
        dimensions: [{ name: 'fraicheur', expected: 'Donnees recentes',
          acceptance: ['La source est actualisee et mesuree.'] }] } });
    const file = path.join(root, 'data.csv');
    fs.writeFileSync(file, 'date,value\nold,1\n');
    const old = new Date(nowMs - 3600000);
    fs.utimesSync(file, old, old);
    const input = { projectId: 'pipeline-a', dimension: 'fraicheur',
      relativePath: 'data.csv', maxAgeMs: 600000, nowMs };
    const stale = await inspectDataFreshness(db, input);
    assert.strictEqual(stale.kind, 'degradation');
    assert.strictEqual((await inspectDataFreshness(db, input)).replayed, true);
    await tickOnce(db, { projectId: 'pipeline-a', owner: 'freshness-test', nowMs });
    assert.strictEqual((await db.get('SELECT COUNT(*) AS n FROM ontogenesis_backlog WHERE project_id = ?', ['pipeline-a'])).n, 1);

    fs.writeFileSync(file, 'date,value\nnew,2\n');
    const current = new Date(nowMs);
    fs.utimesSync(file, current, current);
    const fresh = await inspectDataFreshness(db, input);
    assert.strictEqual(fresh.kind, 'state');
    assert.notStrictEqual(fresh.id, stale.id);
    await tickOnce(db, { projectId: 'pipeline-a', owner: 'freshness-test', nowMs });
    assert.strictEqual((await db.get('SELECT COUNT(*) AS n FROM shev_initiatives WHERE project_id = ?', ['pipeline-a'])).n, 1);

    const missing = await inspectDataFreshness(db, { ...input, relativePath: 'missing.csv' });
    assert.strictEqual(missing.epistemicStatus, 'unknown');
    await tickOnce(db, { projectId: 'pipeline-a', owner: 'freshness-test', nowMs });
    assert.strictEqual((await db.get('SELECT COUNT(*) AS n FROM ontogenesis_backlog WHERE project_id = ?', ['pipeline-a'])).n, 2);
    await assert.rejects(inspectDataFreshness(db, { ...input, relativePath: '../secret.csv' }), /unsafe path/);
    await assert.rejects(inspectDataFreshness(db, { ...input, relativePath: '.env' }), /forbidden/);
    console.log('SHEV data freshness adapter checks passed.');
  } finally {
    await db.close();
    const resolved = fs.realpathSync(root);
    if (path.dirname(resolved) !== fs.realpathSync(os.tmpdir())) throw new Error('Test cleanup escaped temp directory.');
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
