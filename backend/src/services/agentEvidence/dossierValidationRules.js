'use strict';

function validateWorkerDossiersRule1(context) {
  return context.event.evidenceReport || context.event.payload?.evidenceReport || context.event.payload?.report;
}

function validateWorkerDossiersRule2(context) {
  return context.event.evidenceReport || context.event.payload?.evidenceReport || context.event.payload?.report;
}

module.exports = { validateWorkerDossiersRule1, validateWorkerDossiersRule2 };
