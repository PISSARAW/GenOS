'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const { FencedResource } = require('../src/services/continuityProtocol/fence');

const CONTEXT = { scope: { organizationId: 'org:1', projectId: 'project:1' }, missionId: 'mission:1', branchId: 'branch:1' };
const OLD = { agentId: 'agent:1', incarnationId: 'incarnation:old', trustDomain: 'trusted-local' };
const NEW = { ...OLD, incarnationId: 'incarnation:new' };
const BUDGET = { unit: 'write-credit', limit: 5, spent: 0, reserved: 1 };

function bootstrap(overrides = {}) {
  return { ...CONTEXT, operationId: 'bootstrap:1', owner: OLD, generation: 0,
    permissions: ['resource:a', 'resource:b'], budget: BUDGET, ...overrides };
}

function transfer(overrides = {}) {
  return { ...CONTEXT, transferId: 'transfer:1', bundleDigest: digest('sealed-bundle'),
    previousOwner: OLD, successor: NEW, previousGeneration: 0, newGeneration: 1,
    permissions: ['resource:a'], budget: BUDGET, ...overrides };
}

function command(overrides = {}) {
  return { ...CONTEXT, operationId: 'write:1', actor: OLD, generation: 0,
    resourceId: 'resource:a', key: 'record', value: { writtenBy: 'old' }, cost: 1, ...overrides };
}

function resource(overrides = {}) {
  return new FencedResource({ authorize: async () => true, ...overrides });
}

async function durableFencing(directory) {
  const options = { dbPath: path.join(directory, 'resource.sqlite') };
  let live = resource(options);
  try {
    await live.bootstrap(bootstrap());
    const first = command();
    const applied = await live.execute(first);
    assert.deepEqual(await live.execute(first), applied);
    assert.equal(live.effects(CONTEXT).length, 1);
    assert.equal(live.authority(CONTEXT).budget.spent, 1);
    await assert.rejects(live.execute(command({ value: { changed: true } })), /idempotency conflict/);
    const handoff = transfer({ budget: { ...BUDGET, spent: 1 } });
    const receipt = await live.transfer(handoff);
    assert.equal(receipt.status, 'activated');
    assert.equal(receipt.receiptDigest, digest({ profile: 'genos.continuity.fence/receipt/v1', status: 'activated', ...handoff }));
    live.close();
    live = resource(options);
    assert.deepEqual(await live.transfer(handoff), receipt);
    assert.deepEqual(live.authority(CONTEXT).owner, NEW);
    await assert.rejects(live.execute(first), /stale authority/);
    await assert.rejects(live.execute(command({ operationId: 'old:after-reconnect' })), /stale authority/);
    await assert.rejects(live.execute(command({ operationId: 'forged-generation', generation: 1 })), /stale authority/);
    await live.execute(command({ operationId: 'new:write', actor: NEW, generation: 1, value: 'new-value' }));
    assert.equal(live.value(CONTEXT, { resourceId: 'resource:a', key: 'record' }), 'new-value');
    assert.equal(live.effects(CONTEXT).length, 2);
    assert.equal(live.authority(CONTEXT).budget.spent, 2);
    await assert.rejects(live.execute(command({ operationId: 'new:forbidden', actor: NEW, generation: 1,
      resourceId: 'resource:b' })), /permission denied/);
  } finally { live.close(); }
}

async function invalidTransfers() {
  const live = resource();
  try {
    await live.bootstrap(bootstrap());
    await assert.rejects(live.transfer(transfer({ permissions: ['resource:c'] })), /increase permissions/);
    await assert.rejects(live.transfer(transfer({ budget: { ...BUDGET, limit: 6 } })), /conserve/);
    await assert.rejects(live.transfer(transfer({ budget: { ...BUDGET, reserved: 0 } })), /conserve/);
    await assert.rejects(live.transfer(transfer({ newGeneration: 2 })), /increase by one/);
    await assert.rejects(live.transfer(transfer({ successor: OLD })), /successor must change/);
    await assert.rejects(live.transfer(transfer({ previousOwner: { ...OLD, trustDomain: 'forged' } })), /stale authority/);
    await live.transfer(transfer());
    await assert.rejects(live.transfer(transfer({ bundleDigest: digest('other-bundle') })), /idempotency conflict/);
    assert.equal(live.authority(CONTEXT).generation, 1);
  } finally { live.close(); }
}

async function authorizationAndIsolation() {
  assert.throws(() => new FencedResource({}), /authorize callback required/);
  const denied = resource({ authorize: async () => false });
  try {
    await assert.rejects(denied.bootstrap(bootstrap()), /authorization rejected/);
    assert.equal(denied.authority(CONTEXT), null);
    await assert.rejects(denied.execute(command()), /authorization rejected/);
  } finally { denied.close(); }
  const live = resource();
  try {
    await assert.rejects(live.execute(command()), /stale authority/);
    await live.bootstrap(bootstrap());
    await assert.rejects(live.bootstrap(bootstrap({ operationId: 'bootstrap:2' })), /already bootstrapped/);
    const foreign = { ...CONTEXT.scope, projectId: 'foreign' };
    await assert.rejects(live.execute(command({ scope: foreign })), /stale authority/);
    await assert.rejects(live.execute(command({ missionId: 'foreign' })), /stale authority/);
    await assert.rejects(live.execute(command({ branchId: 'foreign' })), /stale authority/);
    await assert.rejects(live.execute(command({ actor: { ...OLD, trustDomain: 'foreign' } })), /stale authority/);
    await assert.rejects(live.execute(command({ scope: { 'organizationId|projectId': 'invalid' } })), /unexpected or missing/);
    assert.equal(live.effects(CONTEXT).length, 0);
    await assert.rejects(live.execute(command({ cost: 5 })), /budget exhausted/);
    await assert.rejects(live.execute(command({ cost: 0.5 })), /invalid operation cost/);
    await assert.rejects(live.bootstrap(bootstrap({ operationId: 'invalid', budget: { ...BUDGET, limit: Infinity } })), /finite JSON/);
  } finally { live.close(); }
}

async function atomicRollback() {
  const live = resource();
  try {
    await live.bootstrap(bootstrap());
    live.store.db.exec(`CREATE TEMP TRIGGER fail_operation BEFORE INSERT ON continuity_resource_operations
      BEGIN SELECT RAISE(ABORT, 'injected persistence failure'); END;`);
    await assert.rejects(live.execute(command()), /injected persistence failure/);
    assert.equal(live.value(CONTEXT, { resourceId: 'resource:a', key: 'record' }), null);
    assert.equal(live.effects(CONTEXT).length, 0);
    assert.equal(live.authority(CONTEXT).budget.spent, 0);
    await assert.rejects(live.transfer(transfer()), /injected persistence failure/);
    assert.deepEqual(live.authority(CONTEXT).owner, OLD);
    live.store.db.exec('DROP TRIGGER fail_operation');
    await live.transfer(transfer());
    assert.deepEqual(live.authority(CONTEXT).owner, NEW);
  } finally { live.close(); }
}

async function concurrentTransfer(directory) {
  const dbPath = path.join(directory, 'concurrent.sqlite');
  const owner = resource({ dbPath });
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let entered;
  const checking = new Promise(resolve => { entered = resolve; });
  const stale = resource({ dbPath, authorize: async () => { entered(); await held; return true; } });
  try {
    await owner.bootstrap(bootstrap());
    const pending = stale.execute(command());
    await checking;
    await owner.transfer(transfer());
    release();
    await assert.rejects(pending, /stale authority/);
    assert.equal(owner.effects(CONTEXT).length, 0);
    assert.equal(owner.authority(CONTEXT).budget.spent, 0);
  } finally { release(); stale.close(); owner.close(); }
}

async function run() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'continuity-fence-'));
  try {
    await durableFencing(directory);
    await invalidTransfers();
    await authorizationAndIsolation();
    await atomicRollback();
    await concurrentTransfer(directory);
    console.log('CONTINUITY resource fencing, durable transfer, budget conservation and atomic effects: PASS');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
