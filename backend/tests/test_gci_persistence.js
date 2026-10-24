'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateGciCapabilityInheritance } = require('../src/db/migrations/migrateGciCapabilityInheritance');
const { bindProject, saveInstallation } = require('../src/services/capabilityInheritance/binding/projectBindingService');
const { publishExport, revokeExport, loadExportRegistry } = require('../src/services/capabilityInheritance/catalog/exportRegistryStore');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateGciCapabilityInheritance(db);
    await migrateGciCapabilityInheritance(db);
    const exportDescriptor = { schema: 'genos.gci.capability/v1', capabilityId: 'gci.test', version: '1.0.0',
      implementationDigest: `sha256:${'d'.repeat(64)}`, provider: { id: 'genos' }, maturity: 'integrated',
      exportModes: ['linked'], inputContract: {}, outputContract: {}, requiredAuthority: [], dependencies: [],
      constraints: {}, sideEffects: [], evidence: [], revocationPolicy: { revocable: true } };
    const graph = { 'gci.test': { id: 'gci.test', category: 'capability' } };
    await publishExport({ db, descriptor: exportDescriptor, capabilityGraph: graph });
    assert.equal((await loadExportRegistry({ db, capabilityGraph: graph })).listExports().length, 1);
    await revokeExport({ db, capabilityId: 'gci.test', version: '1.0.0', reason: 'test' });
    assert.equal((await loadExportRegistry({ db, capabilityGraph: graph })).listExports().length, 0);
    await bindProject({ db, organizationId: 'org-a', projectId: 'project-a', providerId: 'genos', manifest: { id: 'manifest' } });
    const lockfile = { projectId: 'project-a', environment: 'dev', graphDigest: `sha256:${'b'.repeat(64)}`, capabilities: [] };
    assert.equal((await saveInstallation({ db, organizationId: 'org-a', lockfile })).revision, 1);
    await assert.rejects(() => saveInstallation({ db, organizationId: 'org-a', lockfile }), { code: 'GCI_REVISION_CONFLICT' });
    assert.equal((await saveInstallation({ db, organizationId: 'org-a', lockfile, expectedRevision: 1 })).revision, 2);
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM gci_event_ledger')).count, 3);
    assert.equal((await db.get("SELECT COUNT(*) AS count FROM gci_installations WHERE organization_id = 'org-b'")).count, 0);
  } finally {
    await db.close();
  }
}

main().then(() => console.log('GCI persistence: ok')).catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
