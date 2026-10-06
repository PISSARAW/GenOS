'use strict';
const crypto = require('node:crypto');
const { digest } = require('./biologicalIntegrity');
const authority = require('./homeostasisAuthorityStore');
const { collect } = require('./homeostasisExecutionEvidence');

async function assertClosure(db, missionId) {
  const contract = await authority.active(db, missionId);
  const row = await db.get(`SELECT * FROM homeostasis_transition_receipts
    WHERE mission_id = ? ORDER BY rowid DESC LIMIT 1`, missionId);
  if (!contract || !row || row.allowed !== 1) throw denied();
  const receipt = JSON.parse(row.receipt_json);
  const hash = crypto.createHash('sha256').update(row.receipt_json).digest('hex');
  assertReceiptBinding({ row, receipt, hash, contract });
  const state = await db.get('SELECT * FROM homeostasis_states WHERE mission_id = ? ORDER BY rowid DESC LIMIT 1', missionId);
  if (!state || state.id !== receipt.stateId || digest(JSON.parse(state.state_json)) !== digest(receipt.state)) throw denied();
  const execution = await collect(db, missionId);
  if (!execution.satisfied || execution.epoch !== receipt.executionEpoch) throw denied();
  return receipt;
}

function assertReceiptBinding(input) {
  const { row, receipt, hash, contract } = input;
  if (hash !== row.receipt_hash || receipt.schema !== 'genos.homeostasis-transition-receipt/v2') throw denied();
  if (receipt.contractHash !== contract.contractHash || receipt.contractRevision !== contract.revision) throw denied();
  if (receipt.allowed !== true || receipt.state.homeostasisSatisfied !== true) throw denied();
}

function denied() {
  return Object.assign(new Error('Mission completion requires a fresh homeostasis transition receipt bound to current execution evidence'),
    { code: 'HOMEOSTASIS_COMPLETION_RECEIPT_REQUIRED' });
}
module.exports = { assertClosure };
