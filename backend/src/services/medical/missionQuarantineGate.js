'use strict';

const { getClinicalState, initClinicalState } = require('./clinicalStateService');
const { surveillanceScan, quarantine } = require('./immuneSurveillanceService');

function gateError(message, code) {
  return Object.assign(new Error(message), { code });
}

async function prepareClinicalState(db, agentId) {
  return (await getClinicalState(db, agentId)) || initClinicalState(db, agentId);
}

async function persistQuarantine(db, agentId, scan) {
  const detections = scan.detections.map(({ pathologyType, confidence, evidence }) => ({ pathologyType, confidence, evidence }));
  const result = await quarantine(db, agentId, {
    reason: 'Mission dispatch blocked by immune surveillance',
    context: { schema: 'genos.mission-quarantine/v1', detections },
  });
  if (!result.ok) throw gateError('Immune quarantine could not be persisted.', 'QUARANTINE_ENFORCEMENT_FAILED');
}

async function assertMissionDispatchAllowed(db, agentId) {
  if (!db || !agentId) return { checked: false, quarantined: false };
  try {
    await prepareClinicalState(db, agentId);
    const scan = await surveillanceScan(db, agentId);
    if (!scan.state) throw gateError('Clinical state is unavailable.', 'IMMUNE_SURVEILLANCE_UNAVAILABLE');
    if (scan.quarantine) {
      await persistQuarantine(db, agentId, scan);
      throw gateError('Mission dispatch denied: agent quarantined.', 'AGENT_QUARANTINED');
    }
    return { checked: true, quarantined: false, detectionCount: scan.detections.length };
  } catch (error) {
    if (error.code) throw error;
    throw gateError('Immune surveillance failed; mission dispatch denied.', 'IMMUNE_SURVEILLANCE_UNAVAILABLE');
  }
}

module.exports = { assertMissionDispatchAllowed };
