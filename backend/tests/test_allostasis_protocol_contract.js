'use strict';

const assert = require('node:assert/strict');
const { digest, canonicalize } = require('../src/services/evidenceProtocol/canonical');
const { PROTOCOL, MESSAGE_TYPES, UNITS, validateMessage, validateReport, validateForecast } = require('../src/services/allostasisProtocol/contract');
const f = require('./helpers/allostasisContractFixture');

for (const type of MESSAGE_TYPES) {
  const value = f.message(type);
  assert.equal(value.protocol, PROTOCOL);
  assert.deepEqual(validateMessage(value, { now: f.NOW }), value);
  assert.throws(() => f.message(type, { payload: {} }), /contract/);
  assert.throws(() => f.message(type, { payload: { ...value.payload, extra: true } }), /contract/);
}
const message = f.message();
assert.throws(() => validateMessage({ ...message, expiresAt: '2026-12-31T23:59:60Z' }, { now: f.NOW }), /timestamp/);
assert.throws(() => validateMessage(message, { now: message.expiresAt }), /expired/);
assert.throws(() => f.message('REQUEST_BUDGET', { payload: { ...f.payload('REQUEST_BUDGET'), amount: 0.5 } }), /contract/);
assert.throws(() => f.message('REQUEST_BUDGET', { payload: { ...f.payload('REQUEST_BUDGET'), amount: Number.MAX_SAFE_INTEGER + 1 } }), /contract/);
assert.throws(() => f.message('REQUEST_BUDGET', { payload: { ...f.payload('REQUEST_BUDGET'), unit: 'ratio_ppm' } }), /contract/);
assert.throws(() => f.message('REQUEST_BUDGET', { payload: { ...f.payload('REQUEST_BUDGET'), unit: 'cpu_ms' } }), /contract/);
assert.throws(() => f.message('GRANT', { payload: { allocation: f.allocation(), allocationDigest: digest('wrong') } }), /allocation digest/);
assert.throws(() => f.message('REPORT_USAGE', { payload: { ...f.payload('REPORT_USAGE'), status: 'unknown' } }), /contract/);
assert.throws(() => f.message('REPORT_USAGE', { payload: { ...f.payload('REPORT_USAGE'), cumulativeAmount: null } }), /contract/);
assert.equal(f.message('REPORT_USAGE', { payload: { ...f.payload('REPORT_USAGE'), status: 'unknown', cumulativeAmount: null } }).payload.cumulativeAmount, null);
assert.throws(() => validateReport(f.report({ measurements: [] }), { now: f.NOW }), /requires measurements/);
const inconsistent = f.report(); inconsistent.measurements[0].value = null;
assert.throws(() => validateReport(inconsistent, { now: f.NOW }), /unknown measurement/);
const mixedUnits = f.report(); mixedUnits.measurements[0].unit = 'micro_USD';
assert.throws(() => validateReport(mixedUnits, { now: f.NOW }), /cannot be ratio-quantized/);
assert.throws(() => validateForecast(f.forecast({ uncertainty: { kind: 'interval', lower: 7, upper: 10 } }), { now: f.NOW }), /interval/);
for (const unit of UNITS) assert.equal(f.message('REQUEST_BUDGET', { payload: { ...f.payload('REQUEST_BUDGET'), unit } }).payload.unit, unit);
for (const value of [' bad', 'bad ', 'bad\n', 'bad\r\n']) {
  assert.throws(() => f.message('REQUEST_BUDGET', { payload: { ...f.payload('REQUEST_BUDGET'), budgetId: value } }), /contract/);
}
for (const vector of require('../../shared/allostasisProtocol.v1.vectors.json')) {
  assert.equal(canonicalize(vector.input), vector.canonical);
  assert.equal(digest(vector.input), vector.digest);
}
console.log('ALLOSTASIS exact integer units, scoped state/forecast contracts and unknown usage: PASS');
