'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('./helpers/biologyDatabase');
const ledger = require('../src/services/ambientAgency/responsibilityLedgerService');

const scope = { organizationId: 'org-dots', projectId: 'project-1' };

function payload(overrides = {}) {
  return {
    responsibilityId: 'ambient-1', ownerAgentId: 'agent-dots', mandateRef: 'mandate:1',
    consentRef: 'consent:1', objectiveRef: 'objective:retention',
    externalTrajectoryRef: 'trajectory:crm:retention', purpose: 'Detecter une derive client',
    policy: { allowedApps: ['crm', 'support'], allowedFields: ['accountId', 'risk'] },
    recordedAt: '2026-10-20T08:00:00.000Z', ...overrides
  };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-ambient-responsibility-'));
  const filename = path.join(directory, 'ledger.db');
  let db = openDatabase(filename);
  try {
    await db.exec('PRAGMA foreign_keys = ON');
    const first = await ledger.create(db, { ...scope, payload: payload() });
    assert.equal(first.replayed, false);
    assert.equal((await ledger.create(db, { ...scope, payload: payload() })).replayed, true);
    await expectCode(ledger.create(db, { ...scope,
      payload: payload({ purpose: 'Contenu divergent' }) }), 'AMBIENT_RESPONSIBILITY_CONFLICT');
    const second = await ledger.amend(db, { ...scope, expectedVersion: 1,
      payload: payload({ consentRef: 'consent:2',
        policy: { allowedApps: ['crm'], allowedFields: ['risk'] },
        recordedAt: '2026-10-20T09:00:00.000Z' }) });
    assert.equal(second.version, 2);
    assert.deepEqual(second.policy.allowedApps, ['crm']);
    await expectCode(ledger.amend(db, { ...scope, expectedVersion: 1, payload: payload() }),
      'AMBIENT_RESPONSIBILITY_VERSION_CONFLICT');
    assert.deepEqual((await ledger.history(db, { ...scope, responsibilityId: 'ambient-1' }))
      .map((item) => item.version), [1, 2]);
    await assert.rejects(db.run(`UPDATE ambient_responsibility_versions SET change_kind='CREATE'
      WHERE responsibility_id='ambient-1' AND version=2`), /append-only/);
    await db.close();
    db = openDatabase(filename);
    assert.equal((await ledger.current(db, { ...scope,
      responsibilityId: 'ambient-1' })).version, 2);
    await expectCode(ledger.current(db, { organizationId: 'other', projectId: 'project-1',
      responsibilityId: 'ambient-1' }), 'AMBIENT_RESPONSIBILITY_NOT_FOUND');
  } finally {
    await db.close().catch(() => {});
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().then(() => console.log('Ambient responsibility ledger tests passed.')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
