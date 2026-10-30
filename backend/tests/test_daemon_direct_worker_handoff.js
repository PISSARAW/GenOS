'use strict';

const assert = require('node:assert/strict');
const { fixture, closeFixture } = require('./helpers/daemonCompletionFixture');
const cycle = require('../src/services/daemon/residentDaemonCycleService');
const helpers = require('../bin/directWorkerContext.cjs');
const path = require('node:path');
const territories = require('../src/services/daemon/daemonTerritoryService');

async function main() {
  const value = await fixture();
  try {
    await cycle.runCycle(value.context);
    const prompt = await helpers.attachDirectWorkerTerritory(value.db, {
      request: { workspaceRoot: value.root, mission: 'Inspecter probe.js' }, prompt: 'Inspecter probe.js' });
    assert.match(prompt, /RESIDENT DAEMON TERRITORY BRIEF/);
    assert.match(prompt, /probe\.js/);
    const row = await value.db.get('SELECT status FROM daemon_handoffs WHERE territory_id = ?', value.context.territoryId);
    assert.equal(row.status, 'CONSUMED');
    await territories.createTerritory(value.db, { id: 'territory.repo-fallback', organizationId: 'org-test',
      projectId: 'project-test', workspaceId: 'workspace-test', repoIdentity: 'fallback-test',
      rootPath: path.resolve(__dirname, '../..'), headSha: 'a'.repeat(40) });
    const absent = await helpers.attachDirectWorkerTerritory(value.db, {
      request: { workspaceRoot: value.root + '-absent', mission: 'Test' }, prompt: 'Test' });
    assert.equal(absent, 'Test');
    const noWorkspace = await helpers.attachDirectWorkerTerritory(value.db, {
      request: { mission: 'Test' }, prompt: 'Test' });
    assert.equal(noWorkspace, 'Test');
  } finally { await closeFixture(value); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
