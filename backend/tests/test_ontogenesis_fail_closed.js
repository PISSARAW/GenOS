'use strict';

const assert = require('assert');
const fixture = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const { tickOnce } = require('../src/services/ontogenesis/tickService');

async function main() {
  const db = await fixture.memoryDb();
  const repository = await fixture.repository();
  try {
    const projectId = await store.createProject(db, {
      rootPath: repository, branch: 'main', objective: 'Mission configuree',
      config: { ...fixture.testConfig(), topology: 'unknown' }
    });
    const result = await tickOnce(db, { projectId, owner: 'fail-closed-test' });
    const project = await store.getProject(db, projectId);
    const events = await db.all("SELECT * FROM ontogenesis_notifications WHERE project_id = ?", projectId);
    assert.strictEqual(result.blocked, true);
    assert.match(result.reason, /topologie-configuree-inconnue/);
    assert.strictEqual(project.state, 'WAITING_INPUT');
    assert.ok(events.length > 0);
    console.log('ontogenesis fail-closed checks passed.');
  } finally {
    await db.close();
    require('fs').rmSync(repository, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
