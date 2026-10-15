'use strict';

const { extractEvidenceReport } = require('../agentEvidenceService');

function verificationExpectation(request, orchestratorId) {
  if (!request.workspaceRoot || !Array.isArray(request.verifierChecks) || !request.verifierChecks.length) return null;
  return { missionId: request.missionId || orchestratorId, workspaceRoot: request.workspaceRoot, checks: request.verifierChecks };
}

function verifierReceipt(payload = {}) {
  const report = extractEvidenceReport(payload) || {};
  return report.missionVerifierReceipt || report.verifierReceipt
    || payload.missionVerifierReceipt || payload.verifierReceipt || null;
}

async function validateWorkerReceipts(results, expected, validate) {
  for (const result of results) {
    const receipt = result.status === 'completed' ? verifierReceipt(result.payload) : null;
    if (receipt && await validate(receipt, expected)) return { receipt, agentId: result.agentId };
  }
  return null;
}

async function verifiedResolution(state, orchestratorId) {
  const expected = verificationExpectation(state.normalizedMission || {}, orchestratorId);
  if (!expected) return null;
  const validate = require('../ontogenesis/missionVerifierReceiptService').validateReceipt;
  return validateWorkerReceipts([...state.results.values()], expected, validate);
}

module.exports = { verifiedResolution, verificationExpectation, verifierReceipt };
