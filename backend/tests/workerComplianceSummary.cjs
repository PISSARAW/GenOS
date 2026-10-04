'use strict';

const DETERMINISTIC_KINDS = new Set(['formal_worker']);

function expectedUnavailable(kind, errorCode) {
  return DETERMINISTIC_KINDS.has(kind) && errorCode === 'WORKER_EXECUTOR_UNAVAILABLE';
}

function summarizeCompliance(results, kinds) {
  const selected = new Set(results.map((entry) => entry.kind));
  const executed = results.filter((entry) => entry.passed).length;
  const unavailable = results.filter((entry) => !entry.passed && expectedUnavailable(entry.kind, entry.errorCode)).length;
  const accepted = results.length === kinds.length && selected.size === kinds.length
    && results.every((entry) => entry.passed || expectedUnavailable(entry.kind, entry.errorCode));
  return { executed, unavailable, failed: results.length - executed - unavailable, accepted };
}

module.exports = { expectedUnavailable, summarizeCompliance };
