'use strict';

const assert = require('node:assert/strict');
const { resolveRuntimeResources } = require('../../src/services/morphogenesis/runtimeResourceResolution');
const { revalidateAndReserveResources } = require('../../src/services/morphogenesis/runtimeResourceReservation');

function pool(workers, observedAt) {
  return { observedAt, workers, authority: 'genos_database_read_only' };
}

function daemons(list, observedAt) {
  return { observedAt, daemons: list, authority: 'genos_database_read_only' };
}

function liveDaemon() {
  return { daemonId: 'daemon-1', territoryId: 't-1', activity: 'DORMANT',
    health: 'HEALTHY', territoryState: 'ACTIVE', lastHeartbeatAt: new Date(9000).toISOString() };
}

function main() {
  const now = 10000;
  const roles = [{ roleId: 'observation', workerKind: 'scout_cell', methodId: 'scan_literal' }];

  const absent = resolveRuntimeResources({ roles, now });
  assert.equal(absent.status, 'UNKNOWN');

  const stale = resolveRuntimeResources({ roles, now,
    freeWorkerPool: pool([{ instanceId: 'w-1', workerKind: 'scout_cell', status: 'free' }], now - 60000) });
  assert.equal(stale.status, 'UNKNOWN');

  const contradictory = resolveRuntimeResources({ roles, now,
    freeWorkerPool: pool([{ instanceId: 'w-1', workerKind: 'scout_cell', status: 'free' },
      { instanceId: 'w-1', workerKind: 'scout_cell', status: 'busy' }], now) });
  assert.equal(contradictory.status, 'UNKNOWN');

  const empty = resolveRuntimeResources({ roles, now, freeWorkerPool: pool([], now) });
  assert.equal(empty.status, 'BLOCKED');

  const ready = resolveRuntimeResources({ roles, now,
    freeWorkerPool: pool([{ instanceId: 'w-1', workerKind: 'scout_cell', status: 'free' }], now) });
  assert.equal(ready.status, 'READY_FOR_ADMISSION');
  assert.equal(ready.executionAuthorized, false);
  assert.equal(ready.revalidationRequired, true);
  assert.equal(ready.roles[0].instanceId, 'w-1');

  const declaredOnly = resolveRuntimeResources({ roles, now,
    freeWorkerPool: pool([{ instanceId: 'w-9', workerKind: 'bounded_worker', status: 'free' }], now) });
  assert.equal(declaredOnly.status, 'BLOCKED');

  const daemonRoles = [{ roleId: 'monitor', workerKind: 'resident_daemon', methodId: 'monitor_samples' }];
  const noAuth = resolveRuntimeResources({ roles: daemonRoles, now,
    freeWorkerPool: pool([], now), daemonInventory: daemons([liveDaemon()], now) });
  assert.equal(noAuth.status, 'BLOCKED');

  const noDaemon = resolveRuntimeResources({ roles: daemonRoles, now, daemonAllowed: true,
    freeWorkerPool: pool([], now), daemonInventory: daemons([], now) });
  assert.equal(noDaemon.status, 'BLOCKED');

  const staleDaemon = resolveRuntimeResources({ roles: daemonRoles, now, daemonAllowed: true,
    freeWorkerPool: pool([], now),
    daemonInventory: daemons([{ ...liveDaemon(), lastHeartbeatAt: new Date(now - 120000).toISOString() }], now) });
  assert.equal(staleDaemon.status, 'BLOCKED');

  const daemonReady = resolveRuntimeResources({ roles: daemonRoles, now, daemonAllowed: true,
    freeWorkerPool: pool([], now), daemonInventory: daemons([liveDaemon()], now) });
  assert.equal(daemonReady.status, 'READY_FOR_ADMISSION');
}

async function reservation() {
  const now = 10000;
  const resolution = resolveRuntimeResources({
    roles: [{ roleId: 'observation', workerKind: 'scout_cell' }],
    now,
    freeWorkerPool: pool([{ instanceId: 'w-1', workerKind: 'scout_cell', status: 'free' }], now)
  });
  const taken = { getCalls: 0 };
  const db = {
    async get(sql, id) {
      taken.getCalls += 1;
      if (sql.includes('FROM agents')) return { id, status: taken.claimed ? 'running' : 'idle' };
      return null;
    },
    async run(sql) {
      if (sql.includes("SET status = 'running'")) {
        if (taken.claimed) return { changes: 0 };
        taken.claimed = true;
        return { changes: 1 };
      }
      return { changes: 0 };
    }
  };
  db.transaction = async (work) => work();
  const withTx = require('../../src/db');
  const original = withTx.withTransaction;
  withTx.withTransaction = async (ignored, work) => work();
  try {
    const first = await revalidateAndReserveResources(db, resolution, now);
    assert.equal(first.reserved, true);
    const second = await revalidateAndReserveResources(db, resolution, now);
    assert.equal(second.reserved, false);
  } finally {
    withTx.withTransaction = original;
  }
  const stale = await revalidateAndReserveResources(db, { ...resolution, status: 'UNKNOWN' }, now);
  assert.equal(stale.reserved, false);
}

main();
reservation().then(() => console.log('runtime resource resolution: PASS'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
