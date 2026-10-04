'use strict';

const assert = require('node:assert/strict');
const receipts = require('../src/services/biologicalExecutionReceiptService');

const validReceipt = {
  schema: 'genos.biological-execution-receipt/v1',
  receipt_id: '11111111-1111-4111-8111-111111111111',
  mission_id: '22222222-2222-4222-8222-222222222222',
  cell_id: '33333333-3333-4333-8333-333333333333',
  genome_id: '44444444-4444-4444-8444-444444444444',
  genome_fingerprint: 'sha256:known-genome',
  tick: 7,
  execution_scope: 'organism',
  operation: 'Observe',
  metabolic_register: 'rust_orchestrator_metabolism',
  cost: 2.5,
  cost_unit: 'atp_token',
  consumed: true,
  completed: true,
  observed_at_unix_ms: 1234
};
const validDivisionReceipt = {
  schema: 'genos.cell-division-receipt/v1', receipt_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  mission_id: '22222222-2222-4222-8222-222222222222',
  parent_cell_id: '33333333-3333-4333-8333-333333333333', daughter_cell_id: '55555555-5555-4555-8555-555555555555',
  parent_genome_id: '44444444-4444-4444-8444-444444444444', daughter_genome_id: '66666666-6666-4666-8666-666666666666',
  lineage_id: '77777777-7777-4777-8777-777777777777', generation: 1,
  requested_cost: 12, consumed_cost: 12, cost_unit: 'atp_token', completed: true, reason: null, observed_at_unix_ms: 1234
};

assert.deepEqual(receipts.validateReceipt(validReceipt), validReceipt);
assert.throws(() => receipts.validateReceipt({ ...validReceipt, genome_id: null }), { code: 'BIOLOGICAL_RECEIPT_CELL_GENOME_INCOMPLETE' });
assert.throws(() => receipts.validateReceipt({ ...validReceipt, execution_scope: 'cell' }), { code: 'BIOLOGICAL_RECEIPT_SCOPE_INVALID' });

async function testTickBridgeMapsAndPersistsReceipts() {
  const missionId = 'backend-mission-stable';
  const rows = new Map();
  const persisted = [];
  const db = fakeReceiptDatabase({ missionId, rows, persisted });
  const Module = require('node:module');
  const originalLoad = Module._load;
  Module._load = mockCliLoad(originalLoad);
  try {
    const first = await receipts.runMissionTick(db, { missionId, mission: 'test tick', divide: true });
    assert.match(first.rustMissionId, /^[0-9a-f-]{36}$/i);
    assert.equal(persisted[0].missionId, missionId, 'the receipt is stored against the backend mission');
    assert.equal(persisted[1].missionId, missionId, 'division lineage is stored against the backend mission');
    assert.equal(persisted[1].schema, 'genos.cell-division-receipt/v1');
    assert.throws(() => receipts.validateDivisionReceipt({ ...validDivisionReceipt, daughter_genome_id: null }), { code: 'BIOLOGICAL_DIVISION_RECEIPT_LINEAGE_INCOMPLETE' });
    const second = await receipts.runMissionTick(db, { missionId, mission: 'test tick' });
    assert.equal(second.rustMissionId, first.rustMissionId, 'restarts reuse the stable Rust identity');
  } finally {
    Module._load = originalLoad;
  }
}

function fakeReceiptDatabase({ missionId, rows, persisted }) {
  return {
    async exec() {},
    async all() { return []; },
    async get(sql, ...params) { return fakeGet({ sql, params, missionId, rows }); },
    async run(sql, ...params) { return fakeRun({ sql, params, rows, persisted }); }
  };
}

function fakeGet({ sql, params, missionId, rows }) {
  if (sql.includes('FROM missions WHERE mission_id')) return { mission_id: missionId, objective: 'test tick', status: 'active' };
  if (sql.includes('FROM biological_execution_missions')) return rows.get(params[0]) || null;
  return null;
}

function fakeRun({ sql, params, rows, persisted }) {
  if (params.length === 1 && Array.isArray(params[0])) params = params[0];
  if (sql.includes('INSERT OR IGNORE INTO biological_execution_missions')) rows.set(params[0], { rust_mission_id: params[1] });
  if (sql.includes('INSERT OR IGNORE INTO biological_execution_receipts')) persisted.push({ missionId: params[1], receiptId: params[0], schema: params[2] });
  return { changes: 1 };
}

function mockCliLoad(originalLoad) {
  return function load(request, parent, isMain) {
    const isCli = request === './genosCli' && parent?.filename?.endsWith('biologicalExecutionReceiptService.js');
    if (isCli) return { runGenos: async (args) => mockTickResult(args) };
    return originalLoad.call(this, request, parent, isMain);
  };
}

function mockTickResult(args) {
  assert.equal(args[0], 'biological');
  const rustMissionId = args[args.indexOf('--mission-id') + 1];
  return { ok: true, json: { operation: 'biological_mission_tick', mission_id: rustMissionId, tick: 7,
    receipts: [{ ...validReceipt, mission_id: rustMissionId }, ...(args.includes('--divide') ? [{ ...validDivisionReceipt, mission_id: rustMissionId }] : [])] } };
}

testTickBridgeMapsAndPersistsReceipts().then(() => {
  console.log('Biological receipt attribution, mission mapping, and tick bridge passed.');
}).catch((error) => { console.error(error); process.exit(1); });
