'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateGciCapabilityInheritance } = require('../src/db/migrations/migrateGciCapabilityInheritance');
const { invokeLinkedCapability } = require('../src/services/capabilityInheritance/adapters/linkedAdapter');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateGciCapabilityInheritance(db);
    await db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active')");
    await db.run("INSERT INTO projects (id, organization_id) VALUES ('project-a', 'org-a')");
    const capability = { capabilityId: 'gci.echo', version: '1.0.0', implementationDigest: `sha256:${'c'.repeat(64)}`,
      inputContract: { type: 'object', required: ['text'], additionalProperties: false, properties: { text: { type: 'string' } } },
      outputContract: { type: 'string' } };
    const lockfile = { projectId: 'project-a', environment: 'dev', capabilities: [{ ...capability, mode: 'linked', effectiveAuthority: ['echo:run'] }] };
    await db.run("INSERT INTO gci_installations (id, organization_id, project_id, environment, lockfile_json) VALUES ('i', 'org-a', 'project-a', 'dev', ?)", JSON.stringify(lockfile));
    await db.run('INSERT INTO gci_capability_exports (capability_id, version, provider_id, descriptor_json) VALUES (?, ?, ?, ?)', 'gci.echo', '1.0.0', 'genos', JSON.stringify(capability));
    const input = { db, organizationId: 'org-a', projectId: 'project-a', environment: 'dev', capabilityId: 'gci.echo', args: { text: 'hello' }, getProjectAuthority: async () => ['echo:run'], handlers: { 'gci.echo': async ({ args }) => args.text } };
    const result = await invokeLinkedCapability(input);
    assert.equal(result.result, 'hello');
    assert.equal(result.receipt.implementationDigest, capability.implementationDigest);
    assert.equal((await db.get("SELECT COUNT(*) AS count FROM gci_event_ledger WHERE event_type = 'capability_invoked'")).count, 1);
    await assert.rejects(() => invokeLinkedCapability({ ...input, organizationId: 'org-b' }), { code: 'GCI_PROJECT_SCOPE_DENIED' });
    await db.run("UPDATE gci_capability_exports SET status = 'revoked' WHERE capability_id = 'gci.echo'");
    await assert.rejects(() => invokeLinkedCapability(input), { code: 'GCI_CAPABILITY_REVOKED' });
  } finally {
    await db.close();
  }
}

main().then(() => console.log('GCI linked adapter: ok')).catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
