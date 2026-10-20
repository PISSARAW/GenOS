'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('./helpers/biologyDatabase');
const ledger = require('../src/services/ambientAgency/responsibilityLedgerService');
const observations = require('../src/services/ambientAgency/observationService');

const scope = { organizationId: 'org-dots', projectId: 'project-1' };
const responsibility = {
  responsibilityId: 'ambient-1', ownerAgentId: 'agent-dots', mandateRef: 'mandate:1',
  consentRef: 'consent:1', objectiveRef: 'objective:retention',
  externalTrajectoryRef: 'trajectory:crm:retention', purpose: 'Detecter une derive client',
  policy: { allowedApps: ['crm', 'support'], allowedFields: ['accountId', 'risk'] },
  recordedAt: '2026-10-20T08:00:00.000Z'
};

function observation(overrides = {}) {
  return { ...scope, responsibilityId: 'ambient-1', observationId: 'obs-1', sourceApp: 'crm',
    sourceRef: 'crm:event:7', consentRef: 'consent:1',
    provenance: { collectorId: 'connector:crm', permissionRef: 'permission:7' },
    payload: { accountId: 'A-1', risk: 0.8, privateNote: 'must never persist' },
    observedAt: '2026-10-20T08:15:00.000Z', ...overrides };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-ambient-observation-'));
  const db = openDatabase(path.join(directory, 'ambient.db'));
  try {
    await db.exec('PRAGMA foreign_keys = ON');
    await ledger.create(db, { ...scope, payload: responsibility });
    const crm = await observations.ingest(db, observation());
    assert.deepEqual(crm.minimized, { accountId: 'A-1', risk: 0.8 });
    assert.equal(JSON.stringify(crm).includes('privateNote'), false);
    await observations.ingest(db, observation({ observationId: 'obs-2', sourceApp: 'support',
      sourceRef: 'support:ticket:9' }));
    await expectCode(observations.ingest(db, observation({ observationId: 'obs-bad',
      sourceApp: 'calendar' })), 'AMBIENT_APP_NOT_ALLOWED');
    await expectCode(observations.ingest(db, observation({ observationId: 'obs-stale',
      consentRef: 'consent:old' })), 'AMBIENT_CONSENT_STALE');
    const revoked = await observations.revokeAndForget(db, { ...scope, expectedVersion: 1,
      payload: { responsibilityId: 'ambient-1', revocationRef: 'revocation:1',
        recordedAt: '2026-10-20T09:00:00.000Z' } });
    assert.equal(revoked.responsibility.status, 'REVOKED');
    assert.equal(revoked.forgottenCount, 2);
    const forgotten = await observations.read(db, { ...scope, observationId: 'obs-1' });
    assert.equal(forgotten.minimized, null);
    assert.equal(forgotten.sourceRef, 'crm:event:7');
    await expectCode(observations.ingest(db, observation({ observationId: 'obs-after' })),
      'AMBIENT_RESPONSIBILITY_REVOKED');
    await assert.rejects(db.run(`UPDATE ambient_observation_payloads SET minimized_json='{}'
      WHERE observation_id='obs-1'`), /only be forgotten once/);
  } finally {
    await db.close().catch(() => {});
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().then(() => console.log('Ambient observation consent tests passed.')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
