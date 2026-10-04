'use strict';

function invalid(message) {
  return Object.assign(new Error(message), { code: 'HOLOBIONT_EDGE_SYNC_INVALID' });
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(`${field} must be an object.`);
  return value;
}

function required(value, field) {
  const result = String(value || '').trim();
  if (!result) throw invalid(`${field} is required.`);
  return result;
}

function vectorClock(value) {
  const clock = object(value, 'vectorClock');
  const entries = Object.entries(clock);
  if (entries.some(([, tick]) => !Number.isInteger(Number(tick)) || Number(tick) < 0)) throw invalid('Vector clock values must be non-negative integers.');
  return Object.fromEntries(entries.map(([zone, tick]) => [zone, Number(tick)]));
}

function advances(next, prior) {
  const zones = new Set([...Object.keys(next), ...Object.keys(prior)]);
  let changed = false;
  for (const zone of zones) {
    if ((next[zone] || 0) < (prior[zone] || 0)) return false;
    if ((next[zone] || 0) > (prior[zone] || 0)) changed = true;
  }
  return changed;
}

function concurrent(left, right) {
  return JSON.stringify(left) !== JSON.stringify(right) && !advances(left, right) && !advances(right, left);
}

function authorizedEvent(context, event, clock) {
  const trusted = Array.isArray(event.provenance?.evidenceRefs) && event.provenance.evidenceRefs.length > 0
    && typeof context.verifyProvenance === 'function' && context.verifyProvenance(event) === true;
  if (!context.authority.has(event.authorityZone)) return 'ZONE_UNAUTHORIZED';
  if (!trusted) return 'PROVENANCE_MISSING';
  return advances(clock, context.clocks.get(event.authorityZone) || {}) ? null : 'STALE_OR_INVALID_CLOCK';
}

function addConflicts(context, event, clock) {
  const peer = context.accepted.find((item) => item.conflictKey === event.conflictKey && event.conflictKey
    && concurrent(vectorClock(item.vectorClock), clock));
  if (peer && !context.conflicts.some((item) => item.eventIds.includes(event.eventId))) {
    context.conflicts.push({ conflictKey: event.conflictKey, eventIds: [peer.eventId, event.eventId] });
  }
}

function applyEdgeEvent(context, event) {
  const eventId = required(event.eventId, 'eventId');
  if (context.seen.has(eventId)) {
    context.rejected.push({ eventId, reason: 'DUPLICATE_EVENT' });
    return;
  }
  context.seen.add(eventId);
  if (event.capability && context.replicatedCapabilities.size && !context.replicatedCapabilities.has(event.capability)) {
    context.rejected.push({ eventId, reason: 'CAPABILITY_NOT_REPLICATED' });
    return;
  }
  const clock = vectorClock(event.vectorClock);
  const reason = authorizedEvent(context, event, clock);
  if (reason) context.rejected.push({ eventId, reason });
  else {
    addConflicts(context, event, clock);
    context.accepted.push(event);
    context.clocks.set(event.authorityZone, clock);
  }
}

function reconciliationContext(input) {
  const knownEvents = Array.isArray(input.knownEvents) ? input.knownEvents.map((item) => object(item, 'known event')) : [];
  if (knownEvents.length && typeof input.verifyProvenance !== 'function') throw invalid('A provenance verifier is required for stored events.');
  if (knownEvents.some((event) => input.verifyProvenance(event) !== true)) throw invalid('Stored event provenance verification failed.');
  const clocks = new Map(Object.entries(input.priorClocks || {}).map(([zone, clock]) => [zone, vectorClock(clock)]));
  const seen = new Set(knownEvents.map((event) => required(event.eventId, 'known eventId')));
  return { authority: new Set(Array.isArray(input.authorityZones) ? input.authorityZones : []),
    replicatedCapabilities: new Set(Array.isArray(input.replicatedCapabilities) ? input.replicatedCapabilities : []),
    verifyProvenance: input.verifyProvenance, rejected: [], conflicts: [],
    seen, clocks, accepted: knownEvents, initialEventCount: knownEvents.length };
}

function clockSnapshot(clocks) {
  return Object.fromEntries([...clocks.entries()].map(([zone, clock]) => [zone, clock]));
}

function reconcileEdgeEvents(input = {}) {
  const context = reconciliationContext(input);
  const events = Array.isArray(input.events) ? input.events : [];
  for (const raw of events) applyEdgeEvent(context, object(raw, 'edge event'));
  return { accepted: context.accepted.slice(context.initialEventCount), rejected: context.rejected,
    conflicts: context.conflicts, causalClocks: clockSnapshot(context.clocks), autoResolveConflicts: false };
}

function simulateEdgeSynchronization(input = {}) {
  const batches = Array.isArray(input.batches) ? input.batches : [];
  if (!batches.length || batches.length > 20) throw invalid('Synchronization simulation requires 1–20 batches.');
  if (typeof input.verifyProvenance !== 'function') throw invalid('A provenance verifier is required for temporal synchronization.');
  const accepted = (Array.isArray(input.knownEvents) ? input.knownEvents : []).map((item) => object(item, 'known event'));
  let priorClocks = input.priorClocks || {};
  const history = [];
  for (const [index, batch] of batches.entries()) {
    const current = object(batch, `batch ${index + 1}`);
    const result = reconcileEdgeEvents({ ...input, events: Array.isArray(current.events) ? current.events : [],
      knownEvents: accepted, priorClocks });
    accepted.push(...result.accepted);
    priorClocks = result.causalClocks;
    history.push({ batchId: String(current.batchId || index), accepted: result.accepted, rejected: result.rejected,
      conflicts: result.conflicts, causalClocks: result.causalClocks });
  }
  return { status: 'SIMULATED', batchesCompleted: history.length, history, acceptedEventCount: accepted.length,
    conflicts: history.flatMap((item) => item.conflicts), causalClocks: priorClocks, autoResolveConflicts: false };
}

module.exports = { reconcileEdgeEvents, simulateEdgeSynchronization, vectorClock, advances, concurrent };
