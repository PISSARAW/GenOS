'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateGciCapabilityInheritance } = require('../src/db/migrations/migrateGciCapabilityInheritance');
const { migrateGciEvolution } = require('../src/db/migrations/migrateGciEvolution');
const { createCapabilityInheritanceController } = require('../src/controllers/capabilityInheritanceController');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateGciCapabilityInheritance(db);
    await migrateGciEvolution(db);
    await db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active')");
    await db.run("INSERT INTO projects (id, organization_id) VALUES ('project-a', 'org-a')");
    const descriptor = { schema: 'genos.gci.capability/v1', capabilityId: 'gci.read', version: '1.0.0',
      implementationDigest: `sha256:${'f'.repeat(64)}`, provider: { id: 'genos' }, maturity: 'integrated',
      exportModes: ['linked'], inputContract: {}, outputContract: {}, requiredAuthority: ['data:read'],
      dependencies: [], constraints: {}, sideEffects: [], evidence: [], revocationPolicy: { revocable: true } };
    await db.run(`INSERT INTO gci_capability_exports
      (capability_id, version, provider_id, descriptor_json) VALUES (?, ?, ?, ?)`,
    descriptor.capabilityId, descriptor.version, descriptor.provider.id, JSON.stringify(descriptor));
    const controller = createCapabilityInheritanceController({
      getDatabase: async () => db,
      getCapabilityGraph: () => ({ 'gci.read': { id: 'gci.read', category: 'capability' } }),
      accessFor: () => ({ level: 'mcp_tool' }),
      authorize: async ({ context }) => ({ allowed: context.action === 'data:read' })
    });
    const manifest = { schema: 'genos.gci.project/v1', project: { id: 'project-a', environment: 'test' },
      provider: { id: 'genos' }, inherit: [{ capability: 'gci.read', mode: 'linked', version: '1.0.0', permissions: ['data:read'] }] };
    const scope = { headers: { 'x-organization-id': 'org-a', 'x-project-id': 'project-a' },
      tenant: null, user: { keyId: 'operator-a' }, method: 'POST', path: '/resolve',
      params: {}, body: { manifest } };
    const planned = await invoke(controller.resolve, scope);
    assert.equal(planned.lockfile.capabilities[0].effectiveAuthority[0], 'data:read');
    const linked = await invoke(controller.link, { ...scope, params: { projectId: 'project-a' }, body: { manifest } });
    assert.equal(linked.revision, 1);
    const adopted = await invoke(controller.adopt, { ...scope, body: { manifest, expectedBindingRevision: 1, expectedInstallationRevision: 0 } });
    assert.equal(adopted.revision, 1);
    assert.equal(adopted.lockfile.projectId, 'project-a');
    const status = await invoke(controller.status, { ...scope, method: 'GET', params: { projectId: 'project-a' } });
    assert.equal(status.installations[0].revision, 1);
    const upgrade = await invoke(controller.upgrade, { ...scope, params: { projectId: 'project-a' },
      body: { manifest, expectedRevision: 1 } });
    assert.equal(upgrade.status, 'no_change');
    assert.equal(upgrade.plan.automaticMerge, false);
    const replay = await invoke(controller.upgrade, { ...scope, params: { projectId: 'project-a' },
      body: { manifest, expectedRevision: 1 } });
    assert.equal(replay.idempotent, true);
    await invokeError(controller.upgrade, { ...scope, params: { projectId: 'project-a' },
      body: { manifest, expectedRevision: 0 } }, 'GCI_REVISION_CONFLICT');
    await invokeError(controller.resolve, { ...scope, headers: { ...scope.headers, 'x-project-id': 'project-b' } }, 'GCI_PROJECT_SCOPE_DENIED');
    await invokeError(controller.adopt, { ...scope, body: { manifest, expectedBindingRevision: 1, expectedInstallationRevision: 0 } }, 'GCI_REVISION_CONFLICT');
    const revoked = await invoke(controller.revoke, { ...scope, params: { projectId: 'project-a' }, body: {
      capabilityId: 'gci.read', version: '1.0.0', environment: 'test', reason: 'policy changed', expectedRevision: 1
    } });
    assert.equal(revoked.revoked, true);
    const finalStatus = await invoke(controller.status, { ...scope, method: 'GET', params: { projectId: 'project-a' } });
    assert.equal(finalStatus.revocations.length, 1);
    assert.equal(finalStatus.installations[0].revision, 2);
    assert.equal(finalStatus.upgradeCandidates[0].status, 'no_change');
    await invokeError(controller.adopt, { ...scope, body: { manifest,
      expectedBindingRevision: 2, expectedInstallationRevision: 2 } }, 'GCI_CAPABILITY_REVOKED');
  } finally {
    await db.close();
  }
}

async function invoke(handler, req) {
  let response;
  let failure;
  await handler(req, { json: (value) => { response = value; return value; } }, (error) => { failure = error; });
  if (failure) throw failure;
  return response;
}

async function invokeError(handler, req, code) {
  await assert.rejects(() => invoke(handler, req), { code });
}

main().then(() => console.log('GCI control plane: ok')).catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
