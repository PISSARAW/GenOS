'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const territories = require('../../src/services/daemon/daemonTerritoryService');
const runtime = require('../../src/services/daemon/residentDaemonRuntime');

async function fixture(filename = ':memory:') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-daemon-completion-'));
  fs.writeFileSync(path.join(root, 'probe.js'), "module.exports = require('./missing');\n");
  fs.writeFileSync(path.join(root, 'probe.md'), 'Probe module documentation.\n');
  const db = await open({ filename, driver: sqlite3.Database });
  await territories.createTerritory(db, { id: 'territory.completion', organizationId: 'org-test',
    projectId: 'project-test', workspaceId: 'workspace-test', repoIdentity: 'daemon-completion',
    rootPath: root, headSha: 'a'.repeat(40), state: 'BOOTSTRAPPING' });
  const state = runtime.createRuntime(db);
  await runtime.registerDaemon(state, { daemonId: 'daemon.completion', territoryId: 'territory.completion' });
  return { db, root, context: { db, runtime: state, daemonId: 'daemon.completion', territoryId: 'territory.completion' } };
}

async function closeFixture(value) {
  await value.db.close();
  const target = path.resolve(value.root);
  const parent = path.resolve(require('node:os').tmpdir());
  if (!target.startsWith(parent + path.sep) || !path.basename(target).startsWith('genos-daemon-completion-')) throw new Error('Unsafe fixture cleanup');
  fs.rmSync(target, { recursive: true, force: true });
}

module.exports = { fixture, closeFixture };
