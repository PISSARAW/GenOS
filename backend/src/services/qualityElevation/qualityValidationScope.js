'use strict';
const { runIdOf } = require('./qualityReceiptIntegrity');
const { fail } = require('./qualityContract');

function reportOf(event) { return event.evidenceReport || event.payload?.evidenceReport || event.payload?.report; }
function eventRunOf(event) { return event?.executionRunId || event?.payload?.executionRunId; }

function workerScope(worker, dossier, report) {
  if (!require('./workerQualityContractEnforcer').qualityContractOf(worker)) return worker;
  const event = [...(dossier.events || [])].reverse().find(item => reportOf(item) === report);
  const eventRun = eventRunOf(event);
  const expectedRun = runIdOf(worker);
  if (expectedRun && eventRun && expectedRun !== eventRun) throw fail('GQEL_RECEIPT_SCOPE_MISMATCH', 'Quality evidence comes from another execution attempt.');
  if (expectedRun || !eventRun) return worker;
  return { ...worker, executionRunId: eventRun };
}

module.exports = { workerScope };
