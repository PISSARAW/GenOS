'use strict';

function replacer(key, value) {
  if (typeof value === 'number' && !Number.isFinite(value)) throw Error('WORKER_REPORT_NON_FINITE');
  if (['function', 'symbol', 'bigint'].includes(typeof value)) throw Error('WORKER_REPORT_NON_JSON');
  if (Array.isArray(this) && value === undefined) throw Error('WORKER_REPORT_ARRAY_GAP');
  return value;
}

function serialized(report) {
  // Match the persisted telemetry/biological JSON boundary before hashing it.
  // Optional object fields are omitted; invalid measurements remain errors.
  return JSON.parse(JSON.stringify(report, replacer));
}
module.exports = {serialized};
