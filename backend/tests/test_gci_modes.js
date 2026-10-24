'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { generateKeyPairSync } = require('node:crypto');
const { createEmbeddedBundle, verifyEmbeddedBundle } = require('../src/services/capabilityInheritance/adapters/embeddedBundle');
const { invokeEmbeddedCapability } = require('../src/services/capabilityInheritance/adapters/embeddedAdapter');
const { delegateManagedCapability } = require('../src/services/capabilityInheritance/adapters/managedAdapter');
const { buildLockfile } = require('../src/services/capabilityInheritance/resolver/lockfileBuilder');

async function main() {
  await testEmbeddedMode();
  await testManagedMode();
  console.log('GCI Embedded and Managed: ok');
}

async function testEmbeddedMode() {
  const artifact = Buffer.from('portable-capability');
  const descriptor = capabilityDescriptor(artifact, 'embedded');
  const lockfile = lockfileFor(descriptor, 'embedded');
  const keys = generateKeyPairSync('ed25519');
  const bundleBytes = createEmbeddedBundle({ descriptor, artifact, keyId: 'test-key', privateKey: keys.privateKey });
  const bundle = verifyEmbeddedBundle(bundleBytes, { 'test-key': keys.publicKey });
  const receipts = [];
  const result = await invokeEmbeddedCapability(embeddedInput(lockfile, bundle, receipts));
  assert.equal(result.result, 'offline-ok');
  assert.equal(result.receipt.mode, 'embedded');
  assert.equal(receipts.length, 1);
  assert.throws(() => verifyEmbeddedBundle(bundleBytes, {}), { code: 'GCI_PROVENANCE_INVALID' });
  await assert.rejects(() => invokeEmbeddedCapability({ ...embeddedInput(lockfile, bundle, []),
    isRevoked: async () => true }), { code: 'GCI_CAPABILITY_REVOKED' });
  await assert.rejects(() => invokeEmbeddedCapability({ ...embeddedInput(lockfile, bundle, []),
    getProjectAuthority: async () => [] }), { code: 'GCI_AUTHORITY_REVOKED' });
}

function embeddedInput(lockfile, bundle, receipts) {
  return { organizationId: 'org-a', projectId: 'consumer-a', environment: 'offline', capabilityId: 'gci.portable',
    lockfile, args: { value: 'input' }, readDescriptor: async () => bundle.descriptor,
    readArtifact: async () => bundle.artifact, verifyProvenance: async () => true,
    sandboxedRuntime: async ({ artifact, authority }) => {
      assert.equal(artifact.toString(), 'portable-capability');
      assert.deepEqual(authority, ['artifact:read']);
      return 'offline-ok';
    }, getProjectAuthority: async () => ['artifact:read'], isRevoked: async () => false,
    recordReceipt: async (receipt) => receipts.push(receipt) };
}

async function testManagedMode() {
  const db = await require('./ontogenesisFixture').memoryDb();
  const root = await require('./ontogenesisFixture').repository();
  const projectStore = require('../src/services/ontogenesis/projectStore');
  const worktrees = require('../src/services/ontogenesis/worktreeService');
  const { registerResponsibility } = require('../src/services/shev/responsibilityService');
  const { migrateGciCapabilityInheritance } = require('../src/db/migrations/migrateGciCapabilityInheritance');
  try {
    await migrateGciCapabilityInheritance(db);
    await db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active')");
    await db.run("INSERT INTO projects (id, organization_id) VALUES ('consumer-a', 'org-a')");
    await projectStore.createProject(db, { id: 'onto-managed', rootPath: root,
      branch: 'codex/gci-managed', objective: 'Gérer une capacité GCI' });
    await registerResponsibility(db, { projectId: 'onto-managed', authorityRef: 'owner://consumer-a', mandate: {
      purpose: 'qualifier l’usage d’une capacité héritée',
      dimensions: [{ name: 'gci', expected: 'verified', acceptance: ['independent-checks-pass'] }],
      autoDiagnose: true, autoInstrument: false
    } });
    await db.run("UPDATE shev_responsibilities SET stage = 'delegated' WHERE project_id = 'onto-managed'");
    const capsulePath = path.join(worktrees.managedRoot({ id: 'onto-managed', root_path: root }), 'capsules', 'gci-op-1');
    fs.mkdirSync(capsulePath, { recursive: true });
    const descriptor = capabilityDescriptor(Buffer.from('managed-reference'), 'managed');
    const lockfile = lockfileFor(descriptor, 'managed');
    await db.run(`INSERT INTO gci_capability_exports (capability_id, version, provider_id, descriptor_json)
      VALUES (?, ?, ?, ?)`, descriptor.capabilityId, descriptor.version, descriptor.provider.id, JSON.stringify(descriptor));
    await db.run(`INSERT INTO gci_installations
      (id, organization_id, project_id, environment, lockfile_json) VALUES (?, ?, ?, ?, ?)`,
    'install-1', 'org-a', 'consumer-a', 'managed', JSON.stringify(lockfile));
    const delegated = await delegateManagedCapability({ db, organizationId: 'org-a', projectId: 'consumer-a',
      environment: 'managed', capabilityId: descriptor.capabilityId, getProjectAuthority: async () => ['artifact:read'],
      ontogenesisProjectId: 'onto-managed', producerId: 'operator-a', operationId: 'op-1',
      capsulePath, baseRevision: 'abc1234' });
    assert.equal(delegated.receipt.outcome, 'delegated');
    assert.equal(delegated.delegation.plan.source.kind, 'shev_responsibility');
    assert.equal((await db.get("SELECT COUNT(*) AS n FROM gci_event_ledger WHERE event_type = 'managed_delegation_proposed'")).n, 1);
    await assert.rejects(() => delegateManagedCapability({ db, organizationId: 'org-a', projectId: 'consumer-a',
      environment: 'managed', capabilityId: descriptor.capabilityId, getProjectAuthority: async () => [],
      ontogenesisProjectId: 'onto-managed', producerId: 'operator-b', operationId: 'op-2',
      capsulePath, baseRevision: 'abc1234' }), { code: 'GCI_AUTHORITY_REVOKED' });
  } finally {
    await db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function capabilityDescriptor(artifact, mode) {
  const { createHash } = require('node:crypto');
  const digest = `sha256:${createHash('sha256').update(artifact).digest('hex')}`;
  return { schema: 'genos.gci.capability/v1', capabilityId: mode === 'managed' ? 'gci.managed' : 'gci.portable',
    version: '1.0.0', implementationDigest: digest, provider: { id: 'genos', projectId: 'genos-core' },
    maturity: 'verified', exportModes: [mode], inputContract: { type: 'object', additionalProperties: false,
      properties: { value: { type: 'string' } } }, outputContract: { type: 'string' },
    requiredAuthority: ['artifact:read'], dependencies: [], constraints: { maxMemoryMb: 64 },
    sideEffects: [], evidence: [], revocationPolicy: { revocable: true } };
}

function lockfileFor(descriptor, mode) {
  return buildLockfile({ projectId: 'consumer-a', environment: mode === 'managed' ? 'managed' : 'offline',
    capabilities: [{ ...descriptor, mode, effectiveAuthority: ['artifact:read'] }] });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
