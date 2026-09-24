'use strict';

const runtime = require('./holobiontRuntime');

const TRIGGERS = Object.freeze(['MISSION_STARTED', 'CAPABILITY_REQUESTED', 'RESIDENT_HEARTBEAT']);

async function handleEvent(db, event = {}, dependencies = {}) {
  const eventType = String(event.eventType || '').trim().toUpperCase();
  if (!TRIGGERS.includes(eventType)) return { handled: false, reason: 'EVENT_IGNORED' };
  return runtime.runCycle(db, { ...event.payload, eventType }, dependencies);
}

module.exports = { handleEvent, TRIGGERS };
