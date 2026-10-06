'use strict';

const runtime = require('./holobiontRuntime');
const mission = require('./holobiontMissionService');
const health = require('./holobiontHealthLoop');
const governance = require('./holobiontGovernanceLoop');
const stop = require('./stopConditionsService');
const store = require('../holobiontStore');

const TRIGGERS = Object.freeze(['MISSION_STARTED', 'CAPABILITY_REQUESTED', 'RESIDENT_HEARTBEAT', 'MISSION_COMPLETED']);

async function heartbeat(db, input) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session || session.status !== 'ACTIVE') return { handled: false, reason: 'HOST_INACTIVE' };
  if (!session.residentSymbionts.some((item) => item.id === input.symbiontId)) {
    return { handled: false, reason: 'SYMBIONT_UNKNOWN' };
  }
  const report = await health.assess(db, input);
  return { handled: true, status: 'HEALTH_ASSESSED', health: await governance.applyHealthAction(db, input, report) };
}

async function completeMission(db, input) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) return { handled: false, reason: 'HOST_NOT_FOUND' };
  const outputs = session.events.filter((item) => item.eventType === 'CAPABILITY_USED' && item.payload.missionId === input.missionId);
  if (!outputs.length || outputs.some((item) => item.payload.hostDecision?.allowed !== true)) {
    return { handled: true, status: 'STOP_BLOCKED', reason: 'NO_VERIFIED_MISSION_OUTPUT' };
  }
  return stop.stopHolobiont(db, { ...input, expectedSessionRevision: session.revision,
    missionCompleted: true, missionActive: false, allPromotedOutputsImmunePassed: true,
    unresolvedCriticalFailures: session.residentSymbionts.filter((item) => item.status === 'QUARANTINED').length });
}

async function handleEvent(db, event = {}, dependencies = {}) {
  const eventType = String(event.eventType || '').trim().toUpperCase();
  if (!TRIGGERS.includes(eventType)) return { handled: false, reason: 'EVENT_IGNORED' };
  const input = { ...event.payload, eventType };
  if (eventType === 'RESIDENT_HEARTBEAT') return heartbeat(db, input);
  if (eventType === 'MISSION_COMPLETED') return completeMission(db, input);
  if (eventType === 'MISSION_STARTED' && input.steps) return mission.runHolobiontMission(db, input);
  return runtime.runCycle(db, input, dependencies);
}

module.exports = { handleEvent, TRIGGERS };
