'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const controls = require('../src/services/operatorControlCommandService');
const { activeProcesses } = require('../src/services/agentOrchestrationState');
const { migrateOperatorControlReceipts, MIGRATION_ID } =
  require('../src/db/migrations/migrateOperatorControlReceipts');

async function fixture(rootStatus = 'active') {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE missions (mission_id TEXT PRIMARY KEY);
    CREATE TABLE access_keys (
      id TEXT PRIMARY KEY, key_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
      role TEXT NOT NULL, permissions TEXT NOT NULL DEFAULT '["read"]',
      expires_at DATETIME, is_active INTEGER DEFAULT 1
    );
    INSERT INTO missions VALUES ('mission-a');
    INSERT INTO missions VALUES ('mission-b');`);
  await migrateOperatorControlReceipts(db);
  await db.run(`INSERT INTO access_keys (id, key_hash, label, role, permissions)
    VALUES ('operator-a', 'hash-operator-a', 'Operator A', 'operator', '["read","workspace:write","emergency_kill"]'),
      ('viewer-a', 'hash-viewer-a', 'Viewer A', 'viewer', '["read"]')`);
  await db.run(`INSERT INTO mission_episodes
    (episode_id, mission_id, organization_id, project_id, organism_revision, status)
    VALUES ('episode-a', 'mission-a', 'org-a', 'project-a', 'organism:1', 'active')`);
  await db.run(`INSERT INTO cell_threads
    (thread_id, episode_id, mission_id, organization_id, project_id,
      worker_id, cell_kind, status, revision)
    VALUES ('thread-root', 'episode-a', 'mission-a', 'org-a', 'project-a',
      'orchestrator-a', 'orchestrator', ?, 0)`, rootStatus);
  await db.run(`UPDATE mission_episodes SET root_thread_id = 'thread-root'
    WHERE episode_id = 'episode-a'`);
  return db;
}

function request(action, overrides = {}) {
  return {
    idempotencyKey: `control-${action}-1`, action,
    missionId: 'mission-a', episodeId: 'episode-a', threadId: 'thread-root',
    organizationId: 'org-a', projectId: 'project-a', actorId: 'operator-a',
    reason: `operator_${action}`, ...overrides
  };
}

function provenControl(calls = []) {
  return { apply: async (entry) => {
    calls.push({ action: entry.action, threadId: entry.target.thread_id });
    return { proven: true, code: `${entry.action.toUpperCase()}_ACK`, detail: 'test proof' };
  } };
}

test('migration 129 stores an immutable final pause receipt', async () => {
  const db = await fixture();
  try {
    assert.equal(MIGRATION_ID, '129-operator-control-receipts');
    const result = await controls.execute(db, request('pause'), {
      runtimeControl: provenControl()
    });
    assert.equal(result.command.status, 'applied');
    assert.equal(result.receipt.outcome, 'applied');
    assert.equal(result.receipt.resultCode, 'PAUSE_ACK');
    assert.equal((await db.get(`SELECT status FROM cell_threads
      WHERE thread_id = 'thread-root'`)).status, 'waiting_signal');
    await assert.rejects(db.run(`UPDATE operator_control_receipts
      SET result_code = 'FORGED' WHERE receipt_id = ?`, result.receipt.receiptId),
    /OPERATOR_CONTROL_RECEIPT_IMMUTABLE/);
    await assert.rejects(db.run(`DELETE FROM operator_control_receipts
      WHERE receipt_id = ?`, result.receipt.receiptId),
    /OPERATOR_CONTROL_RECEIPT_IMMUTABLE/);
  } finally { await db.close(); }
});

test('resume requires an applied pause receipt for the current revision', async () => {
  const db = await fixture();
  const calls = [];
  try {
    await controls.execute(db, request('pause'), { runtimeControl: provenControl(calls) });
    const input = request('resume', { idempotencyKey: 'control-resume-1' });
    const first = await controls.execute(db, input, { runtimeControl: provenControl(calls) });
    const replay = await controls.execute(db, input, { runtimeControl: provenControl(calls) });
    assert.equal(first.command.status, 'applied');
    assert.ok(first.receipt.evidence.pauseReceiptId);
    assert.equal(first.receipt.receiptId, replay.receipt.receiptId);
    assert.equal(calls.length, 2);
    assert.equal((await db.get(`SELECT status FROM cell_threads
      WHERE thread_id = 'thread-root'`)).status, 'active');

    await db.run(`UPDATE cell_threads SET status = 'waiting_signal', revision = revision + 1
      WHERE thread_id = 'thread-root'`);
    const stale = await controls.execute(db, request('resume', {
      idempotencyKey: 'control-resume-stale'
    }), { runtimeControl: provenControl(calls) });
    assert.equal(stale.command.status, 'rejected');
    assert.equal(stale.receipt.resultCode, 'PAUSE_PROOF_REQUIRED');
  } finally { await db.close(); }
});

test('cancel propagates to active descendants without inventing completion', async () => {
  const db = await fixture();
  const calls = [];
  try {
    await db.run(`INSERT INTO cell_threads
      (thread_id, episode_id, mission_id, organization_id, project_id,
        parent_thread_id, worker_id, cell_kind, status, revision)
      VALUES ('thread-worker-a', 'episode-a', 'mission-a', 'org-a', 'project-a',
        'thread-root', 'worker-a', 'worker', 'active', 5),
      ('thread-worker-b', 'episode-a', 'mission-a', 'org-a', 'project-a',
        'thread-root', 'worker-b', 'worker', 'ready', 7)`);
    const result = await controls.execute(db, request('cancel'), {
      runtimeControl: provenControl(calls)
    });
    assert.equal(result.command.status, 'applied');
    assert.deepEqual(calls.map(item => item.threadId).sort(),
      ['thread-root', 'thread-worker-a', 'thread-worker-b']);
    const rows = await db.all(`SELECT status FROM cell_threads ORDER BY thread_id`);
    assert.ok(rows.every(row => row.status === 'apoptotic'));
    assert.ok(rows.every(row => row.status !== 'completed_execution'));
    assert.deepEqual(result.receipt.evidence.propagatedThreadIds.sort(),
      ['thread-root', 'thread-worker-a', 'thread-worker-b']);
  } finally { await db.close(); }
});

test('unproven live control is rejected and never changes CellThread state', async () => {
  const db = await fixture();
  try {
    const unavailable = { apply: async () => ({ proven: false,
      code: 'RUNTIME_UNAVAILABLE', detail: 'no correlated runtime' }) };
    const result = await controls.execute(db, request('pause'), {
      runtimeControl: unavailable
    });
    assert.equal(result.command.status, 'rejected');
    assert.equal(result.receipt.outcome, 'rejected');
    assert.equal(result.receipt.resultCode, 'RUNTIME_UNAVAILABLE');
    assert.equal((await db.get(`SELECT status FROM cell_threads
      WHERE thread_id = 'thread-root'`)).status, 'active');
    const cancelled = await controls.execute(db, request('cancel', {
      idempotencyKey: 'control-cancel-unavailable'
    }));
    assert.equal(cancelled.command.status, 'rejected');
    assert.equal(cancelled.receipt.resultCode, 'RUNTIME_UNAVAILABLE');
    assert.equal((await db.get(`SELECT status FROM cell_threads
      WHERE thread_id = 'thread-root'`)).status, 'active');
  } finally { await db.close(); }
});

test('default cancellation rejects a live process from another tenant identity', async () => {
  const db = await fixture();
  activeProcesses.set('orchestrator-a', {
    genosControlIdentity: {
      workerId: 'orchestrator-a', missionId: 'mission-a', episodeId: 'episode-a',
      threadId: 'thread-root', organizationId: 'org-other', projectId: 'project-a'
    }
  });
  try {
    const result = await controls.execute(db, request('cancel'));
    assert.equal(result.command.status, 'rejected');
    assert.equal(result.receipt.resultCode, 'RUNTIME_IDENTITY_UNPROVEN');
    assert.equal(result.receipt.evidence.controls[0].proven, false);
    assert.equal((await db.get(`SELECT status FROM cell_threads
      WHERE thread_id = 'thread-root'`)).status, 'active');
  } finally {
    activeProcesses.delete('orchestrator-a');
    await db.close();
  }
});

test('scope, authority, idempotency and revision collisions fail closed', async () => {
  const db = await fixture();
  try {
    await assert.rejects(controls.execute(db, request('pause', {
      organizationId: 'org-b'
    }), { runtimeControl: provenControl() }),
    error => error.code === 'OPERATOR_CONTROL_SCOPE_DENIED');
    await assert.rejects(controls.execute(db, request('pause', {
      actorId: 'forged'
    }), { runtimeControl: provenControl() }),
    error => error.code === 'OPERATOR_CONTROL_ACTOR_UNTRUSTED');

    const deniedInput = request('pause', { idempotencyKey: 'denied-1',
      actorId: 'viewer-a' });
    const denied = await controls.execute(db, deniedInput, {
      runtimeControl: provenControl()
    });
    assert.equal(denied.command.status, 'rejected');
    assert.equal(denied.receipt.resultCode, 'AUTHORITY_DENIED');
    await assert.rejects(controls.execute(db, { ...deniedInput, action: 'resume' }, {
      runtimeControl: provenControl()
    }), error => error.code === 'OPERATOR_CONTROL_IDEMPOTENCY_COLLISION');

    const racingControl = { apply: async () => {
      await db.run(`UPDATE cell_threads SET revision = revision + 1
        WHERE thread_id = 'thread-root'`);
      return { proven: true, code: 'PAUSE_ACK' };
    } };
    const conflict = await controls.execute(db, request('pause', {
      idempotencyKey: 'revision-conflict-1'
    }), { runtimeControl: racingControl });
    assert.equal(conflict.command.status, 'applied');
    assert.equal(conflict.receipt.resultCode, 'CONTROL_APPLIED_RECONCILIATION_REQUIRED');
    assert.equal(conflict.receipt.evidence.projectionConflicts.length, 1);
    assert.equal((await db.get(`SELECT status FROM cell_threads
      WHERE thread_id = 'thread-root'`)).status, 'active');
  } finally { await db.close(); }
});

test('terminal work is never reported as already cancelled', async () => {
  const db = await fixture('completed_execution');
  const calls = [];
  try {
    const result = await controls.execute(db, request('cancel'), {
      runtimeControl: provenControl(calls)
    });
    assert.equal(result.command.status, 'rejected');
    assert.equal(result.receipt.resultCode, 'TERMINAL_STATE_UNPROVEN');
    assert.equal(calls.length, 0);
    assert.equal((await db.get(`SELECT status FROM cell_threads
      WHERE thread_id = 'thread-root'`)).status, 'completed_execution');
  } finally { await db.close(); }
});

test('an expired pending command is reclaimed and finalized once', async () => {
  const db = await fixture();
  let calls = 0;
  try {
    const input = request('pause', { idempotencyKey: 'lease-reclaim-1' });
    const first = await controls.execute(db, input, { runtimeControl: {
      apply: async () => {
        calls += 1;
        await db.run(`UPDATE operator_control_commands
          SET owner_token = 'orphaned', lease_expires_at = 0 WHERE status = 'pending'`);
        return { proven: true, code: 'PAUSE_ACK', detail: 'first owner lost' };
      }
    } });
    assert.equal(first.command.status, 'pending');
    assert.equal(first.receipt, null);
    const recovered = await controls.execute(db, input, {
      runtimeControl: provenControl()
    });
    assert.equal(recovered.command.status, 'applied');
    assert.equal(recovered.command.attemptCount, 2);
    assert.equal(recovered.receipt.outcome, 'applied');
    assert.equal(calls, 1);
  } finally { await db.close(); }
});

test('final command identity is frozen and receipt corruption is detected', async () => {
  const db = await fixture();
  const input = request('pause', { idempotencyKey: 'integrity-1' });
  try {
    const result = await controls.execute(db, input, { runtimeControl: provenControl() });
    await assert.rejects(db.run(`UPDATE operator_control_commands SET reason = 'forged'
      WHERE command_id = ?`, result.command.commandId), /OPERATOR_CONTROL_COMMAND/);
    await db.exec('DROP TRIGGER operator_control_receipt_immutable');
    await db.run(`UPDATE operator_control_receipts SET evidence_json = '{"forged":true}'
      WHERE receipt_id = ?`, result.receipt.receiptId);
    await assert.rejects(controls.execute(db, input, { runtimeControl: provenControl() }),
      error => error.code === 'OPERATOR_CONTROL_RECEIPT_INTEGRITY_FAILURE');
  } finally { await db.close(); }
});
