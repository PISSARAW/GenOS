'use strict';

const crypto = require('node:crypto');
const { canonicalize } = require('./evaluationGraders');

const BOUND_ALGORITHM = 'sha256-parent-v1';

function payloadHash(payloadJson, parentHash = null) {
  return crypto.createHash('sha256')
    .update(`genos-provenance-v1\0${parentHash || ''}\0${payloadJson}`)
    .digest('hex');
}

function hashForRecord(record, payloadJson) {
  if (!record.algorithm || record.algorithm === 'sha256') {
    return crypto.createHash('sha256').update(payloadJson).digest('hex');
  }
  if (record.algorithm === BOUND_ALGORITHM) return payloadHash(payloadJson, record.parent_hash);
  return null;
}

function isValidRecordHash(record) {
  if (!record?.payload_hash || !record?.payload_json) return false;
  let payload;
  try { payload = JSON.parse(record.payload_json); } catch (_) { return false; }
  const expected = hashForRecord(record, JSON.stringify(canonicalize(payload)));
  return Boolean(expected) && expected === String(record.payload_hash).toLowerCase();
}

module.exports = { BOUND_ALGORITHM, payloadHash, hashForRecord, isValidRecordHash };
