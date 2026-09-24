'use strict';

const store = require('./holobiontStore');
const planner = require('../morphogenesis/morphogenesisPlannerService');

async function missionHistory(db, hostId) {
  return db.all(`SELECT mission_id AS missionId, attached_at AS attachedAt
    FROM holobiont_mission_links WHERE host_id = ? ORDER BY attached_at, mission_id`, hostId);
}

function residentCapabilities(session) {
  return [...new Set(session.residentSymbionts
    .filter((item) => item.status === 'RESIDENT')
    .flatMap((item) => Array.isArray(item.capabilities) ? item.capabilities : []))];
}

function ineligible(reason, missing = []) {
  return { activated: false, reason, missing };
}

function planForHost(input, session, capabilities) {
  const currentState = { topology: 'holobionte', capabilities, agents: [] };
  const plan = planner.planMorphogenesis({
    currentState, proposedTopology: input.proposedTopology,
    budget: input.budget || 0, reason: `persistent-holobiont:${session.hostId}`,
    expression: input.expression, communityJudgment: input.communityJudgment,
    biocenoseSignals: input.biocenoseSignals
  });
  return { activated: true, hostId: session.hostId, holobiontId: session.holobiontId,
    missionsObserved: input.missionHistory.length, residentCapabilities: capabilities, plan };
}

async function planPersistentHost(db, input = {}) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw Object.assign(new Error('Holobiont session not found.'), { code: 'HOLOBIONT_SESSION_NOT_FOUND' });
  if (session.scope !== 'PERSISTENT') return ineligible('PERSISTENT_IDENTITY_REQUIRED');
  if (!session.constitution) return ineligible('HOST_CONSTITUTION_REQUIRED');
  const missions = await missionHistory(db, session.hostId);
  if (missions.length < 2) return ineligible('MULTI_MISSION_HISTORY_REQUIRED');
  const capabilities = residentCapabilities(session);
  if (!capabilities.length) return ineligible('RESIDENT_CAPABILITY_REQUIRED');
  return planForHost({ ...input, missionHistory: missions }, session, capabilities);
}

module.exports = { planPersistentHost };
