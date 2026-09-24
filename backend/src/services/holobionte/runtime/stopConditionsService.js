'use strict';

const store = require('../holobiontStore');
const sanctions = require('../governance/sanctionService');

function openCriticalFailures(value) {
  const count = Number(value || 0);
  if (!Number.isInteger(count) || count < 0) {
    throw Object.assign(new Error('unresolvedCriticalFailures must be a non-negative integer.'), { code: 'HOLOBIONT_STOP_INPUT_INVALID' });
  }
  return count;
}

function stopBlocked(reasons) {
  return { stopped: false, disposition: 'ACTIVE', reasons };
}

function missionStopReasons(input) {
  const reasons = [];
  if (input.missionCompleted !== true) reasons.push('MISSION_INCOMPLETE');
  if (input.allPromotedOutputsImmunePassed !== true) reasons.push('PROMOTED_OUTPUTS_NOT_IMMUNE_VERIFIED');
  if (openCriticalFailures(input.unresolvedCriticalFailures) > 0) reasons.push('CRITICAL_SYMBIONT_FAILURE_UNRESOLVED');
  return reasons;
}

async function requestDormancy(db, input, session) {
  const ids = [...new Set(Array.isArray(input.dormantSymbiontIds) ? input.dormantSymbiontIds : [])];
  if (ids.length && (!input.dormancyEvidence || typeof input.dormancyEvidence !== 'object')) {
    throw Object.assign(new Error('Dormancy evidence is required.'), { code: 'HOLOBIONT_EVIDENCE_REQUIRED' });
  }
  const receipts = [];
  let revision = session.revision;
  for (const symbiontId of ids) {
    const resident = session.residentSymbionts.find((item) => item.id === symbiontId && item.status === 'RESIDENT');
    if (!resident) throw Object.assign(new Error('Only an active resident symbiont can become dormant.'), { code: 'HOLOBIONT_RESIDENT_REQUIRED' });
    const result = await sanctions.sanctionSymbiont(db, {
      ...input.dormancyEvidence, holobiontId: session.holobiontId,
      expectedSessionRevision: revision, symbiontId, action: 'DORMANT'
    });
    if (!result.applied) return { accepted: false, receipts, result };
    receipts.push(result);
    revision = (await store.getSession(db, session.holobiontId)).revision;
  }
  return { accepted: true, receipts, revision };
}

async function stopMissionScoped(db, input, session) {
  const reasons = missionStopReasons(input);
  if (reasons.length) return stopBlocked(reasons);
  const lifecycle = await store.updateLifecycleStatus(db, {
    holobiontId: session.holobiontId, expectedRevision: session.revision,
    status: 'CLOSED', eventType: 'CLOSED', payload: { missionId: session.missionId }
  });
  return { stopped: true, disposition: lifecycle.status, sessionRevision: lifecycle.revision };
}

async function stopPersistent(db, input, session) {
  if (input.missionActive !== false) return stopBlocked(['MISSION_STILL_ACTIVE']);
  if (openCriticalFailures(input.unresolvedCriticalFailures) > 0) {
    return stopBlocked(['CRITICAL_SYMBIONT_FAILURE_UNRESOLVED']);
  }
  const dormancy = await requestDormancy(db, input, session);
  if (!dormancy.accepted) return { ...stopBlocked(['DORMANCY_SANCTION_REJECTED']), dormancy };
  const current = await store.getSession(db, session.holobiontId);
  const lifecycle = await store.updateLifecycleStatus(db, {
    holobiontId: current.holobiontId, expectedRevision: current.revision,
    status: 'QUIESCENT', eventType: 'QUIESCENT',
    payload: { completedMissionId: input.missionId || null, dormantSymbiontIds: input.dormantSymbiontIds || [] }
  });
  return { stopped: true, disposition: lifecycle.status, sessionRevision: lifecycle.revision, dormancy: dormancy.receipts };
}

async function stopHolobiont(db, input = {}) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw Object.assign(new Error('Holobiont session not found.'), { code: 'HOLOBIONT_SESSION_NOT_FOUND' });
  if (Number(input.expectedSessionRevision) !== session.revision) {
    throw Object.assign(new Error('Holobiont revision conflict.'), { code: 'HOLOBIONT_REVISION_CONFLICT' });
  }
  return session.scope === 'MISSION'
    ? stopMissionScoped(db, input, session) : stopPersistent(db, input, session);
}

module.exports = { stopHolobiont };
