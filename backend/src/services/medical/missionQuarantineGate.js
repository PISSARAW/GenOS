'use strict';

const { getClinicalState, initClinicalState } = require('./clinicalStateService');
const { immuneResponse } = require('./immuneSurveillanceService');

function gateError(message, code) {
  return Object.assign(new Error(message), { code });
}

async function prepareClinicalState(db, agentId) {
  return (await getClinicalState(db, agentId)) || initClinicalState(db, agentId);
}

async function assertMissionDispatchAllowed(db, agentId) {
  if (!db || !agentId) return { checked: false, quarantined: false };
  try {
    await prepareClinicalState(db, agentId);
    const response = await immuneResponse(db, agentId);
    if (!response.state) throw gateError('Clinical state is unavailable.', 'IMMUNE_SURVEILLANCE_UNAVAILABLE');
    if (response.responses.some((item) => item.quarantine?.ok)) {
      throw gateError('Mission dispatch denied: agent quarantined.', 'AGENT_QUARANTINED');
    }
    return { checked: true, quarantined: false, detectionCount: response.responses.length };
  } catch (error) {
    if (error.code) throw error;
    throw gateError('Immune surveillance failed; mission dispatch denied.', 'IMMUNE_SURVEILLANCE_UNAVAILABLE');
  }
}

module.exports = { assertMissionDispatchAllowed };
