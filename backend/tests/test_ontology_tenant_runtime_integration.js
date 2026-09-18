'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getDatabase, closeDatabase } = require('../src/db');
const worlds = require('../src/services/ontology/possibleWorldService');
const personOther = require('../src/services/ontology/personOtherService');

async function main() {
  process.env.GENOS_ADMIN_PASSWORD = 'ontology-integration-test-password';
  process.env.GENOS_ADMIN_TOKEN = 'ontology-integration-test-token';
  const dbPath = path.join(os.tmpdir(), `genos-ontology-${process.pid}.db`);
  const db = await getDatabase(dbPath);
  const tenantA = { organizationId: 'org-a', projectId: 'project-a' };
  const tenantB = { organizationId: 'org-b', projectId: 'project-b' };
  await worlds.createWorld({ worldId: 'world-a', assumptions: [{ key: 'budget', value: 1 }], ...tenantA });
  await worlds.createWorld({ worldId: 'world-b', assumptions: [{ key: 'budget', value: 2 }], ...tenantB });
  assert.equal((await worlds.getWorld({ worldId: 'world-a', ...tenantB })).found, false);
  assert.equal((await worlds.listWorlds(tenantA)).length, 1);
  await personOther.defineOther({ subjectId: 'agent-a', otherId: 'agent-b', ...tenantA });
  assert.equal((await personOther.listOtherRelations({ subjectId: 'agent-a', ...tenantB })).length, 0);
  const receipt = await worlds.createReceipt({ worldId: 'world-a', outcome: { result: 'simulated' }, ...tenantA });
  assert.equal((await worlds.verifyReceipt({ receiptId: receipt.receiptId, ...tenantA })).status, 'verified');
  await closeDatabase();
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(`${dbPath}${suffix}`); } catch (_) {}
  }
  console.log('Ontology tenant/runtime integration tests passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
