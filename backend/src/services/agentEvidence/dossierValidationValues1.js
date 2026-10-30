'use strict';

function validateWorkerDossiersValue1(__genosValueScope1) {
  return __genosValueScope1.event.evidenceReport || __genosValueScope1.event.payload?.evidenceReport || __genosValueScope1.event.payload?.report;
}

function validateWorkerDossiersValue2(__genosValueScope2) {
  return __genosValueScope2.event.evidenceReport || __genosValueScope2.event.payload?.evidenceReport || __genosValueScope2.event.payload?.report;
}

module.exports = { validateWorkerDossiersValue1, validateWorkerDossiersValue2 };
