'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const habitat = require('../src/services/habitatRevisionService');

const scope = { organizationId: 'org-a', projectId: 'project-a' };

function configuration(runtimeKind = 'process') {
  return {
    runtimeKind,
    imageDigest: null,
    filesystemPolicy: { type: 'workspace_copy', readOnlyRoot: false },
    networkPolicy: { type: 'none', allowedHosts: [] },
    limits: { cpuSeconds: null, memoryMb: null, pidCount: null, diskMb: 512,
      wallClockMs: 60000, outputBytes: 32768 },
    secretBrokerPolicy: { type: 'unavailable' },
    mountedResources: [],
    isolationAssertions: { filesystem: 'declared', network: 'unavailable', process: 'unavailable' }
  };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, error => error.code === code);
}

async function main() {
  const db = openDatabase();
  await db.exec('PRAGMA foreign_keys = ON');
  try {
    const first = await habitat.registerRevision(db, { habitatId: 'local-process',
      configuration: configuration(), expectedRevision: 0, ...scope });
    assert.equal(first.revision, 1);
    assert.equal(first.configuration.limits.cpuSeconds, null);

    const noOp = await habitat.registerRevision(db, { habitatId: 'local-process',
      configuration: configuration(), expectedRevision: 1, ...scope });
    assert.equal(noOp.revision, 1);

    const nextConfiguration = configuration('container');
    nextConfiguration.imageDigest = `sha256:${'a'.repeat(64)}`;
    nextConfiguration.isolationAssertions = { filesystem: 'enforced', network: 'enforced', process: 'enforced' };
    const second = await habitat.registerRevision(db, { habitatId: 'local-process',
      configuration: nextConfiguration, expectedRevision: 1, ...scope });
    assert.equal(second.revision, 2);
    assert.equal(second.previousHash, first.contentHash);

    await expectCode(habitat.registerRevision(db, { habitatId: 'local-process',
      configuration: configuration(), expectedRevision: 1, ...scope }), 'HABITAT_REVISION_CONFLICT');
    await expectCode(habitat.getRevision(db, { habitatId: 'local-process', revision: 2,
      organizationId: 'org-b', projectId: 'project-a' }), 'HABITAT_TENANT_MISMATCH');

    const binding = await habitat.bindMission(db, { missionId: 'mission-a', habitatId: 'local-process',
      revision: 2, ...scope });
    assert.equal(binding.habitatHash, second.contentHash);
    assert.deepEqual(await habitat.missionBinding(db, { missionId: 'mission-a', ...scope }), binding);

    await assert.rejects(db.run("UPDATE habitat_revisions SET content_hash = 'tampered' WHERE habitat_id = 'local-process'"),
      /Immutable habitat revision/);
    await expectCode(Promise.resolve().then(() => habitat.validateConfiguration({
      ...configuration(), limits: { cpuSeconds: 0 }
    })), 'HABITAT_LIMIT_INVALID');
    await expectCode(Promise.resolve().then(() => habitat.validateConfiguration(configuration('container'))),
      'HABITAT_IMAGE_DIGEST_REQUIRED');
  } finally {
    await db.close();
  }
}

main().then(() => console.log('habitat revision service tests passed')).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
