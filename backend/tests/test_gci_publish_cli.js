'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { publishLocalExport } = require('../bin/genos-gci.cjs');
const { migrateGciCapabilityInheritance } = require('../src/db/migrations/migrateGciCapabilityInheritance');
const { publishExport, loadExportRegistry } = require('../src/services/capabilityInheritance/catalog/exportRegistryStore');

async function main() {
  await assert.rejects(() => publishLocalExport([]), /publish requires --descriptor/);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-gci-publish-'));
  const descriptorPath = path.join(tempDir, 'descriptor.json');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateGciCapabilityInheritance(db);
    await fs.writeFile(descriptorPath, JSON.stringify(descriptor()), 'utf8');
    const output = [];
    await publishLocalExport(['--descriptor', descriptorPath], {
      getDatabase: async () => db,
      closeDatabase: async () => {},
      getCapabilityGraph: () => ({ 'gci.catalog.read': { id: 'gci.catalog.read', category: 'capability' } }),
      publishExport,
      writeOutput: (value) => output.push(value)
    });
    assert.equal(JSON.parse(output[0]).capabilityId, 'gci.catalog.read');
    const registry = await loadExportRegistry({ db, capabilityGraph: {
      'gci.catalog.read': { id: 'gci.catalog.read', category: 'capability' }
    } });
    assert.equal(registry.listExports().length, 1);
  } finally {
    await db.close();
    await fs.unlink(descriptorPath);
    await fs.rmdir(tempDir);
  }
}

function descriptor() {
  return {
    schema: 'genos.gci.capability/v1',
    capabilityId: 'gci.catalog.read',
    version: '1.0.0',
    implementationDigest: `sha256:${'a'.repeat(64)}`,
    provider: { id: 'genos' },
    maturity: 'integrated',
    exportModes: ['linked'],
    inputContract: {},
    outputContract: {},
    requiredAuthority: [],
    dependencies: [],
    constraints: {},
    sideEffects: [],
    evidence: [],
    revocationPolicy: { revocable: true }
  };
}

main().then(() => console.log('GCI local export publisher: ok')).catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
