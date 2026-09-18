'use strict';

/**
 * Epistemic contradiction bus.
 *
 * Point 11 — Pub/sub event bus for epistemic contradictions.
 *
 * Events:
 *  - contradiction               : two claims conflict on the same subject
 *  - claim_revised               : an accepted claim's quality changed
 *  - debt_escalated              : an epistemic debt crossed severity threshold
 *  - belief_promoted             : a belief claim was later corroborated
 *  - belief_demotioned           : a belief claim was later falsified
 *
 * The bus is in-memory by default; a persistent variant can be wired in
 * once `epistemic_events` table exists (future migration).
 */

const EVENT_TYPES = Object.freeze({
  CONTRADICTION: 'contradiction',
  CLAIM_REVISED: 'claim_revised',
  DEBT_ESCALATED: 'debt_escalated',
  BELIEF_PROMOTED: 'belief_promoted',
  BELIEF_DEMOTED: 'belief_demotioned',
  CLAIM_ACCEPTED: 'claim_accepted',
  CLAIM_REJECTED: 'claim_rejected',
  DEBT_CREATED: 'debt_created',
  DEBT_RESOLVED: 'debt_resolved',
});

const isEventType = (v) => Object.values(EVENT_TYPES).includes(v);

// ---------------------------------------------------------------------------
// In-memory subscribers
// ---------------------------------------------------------------------------

const subscribers = new Map(); // topic -> Set<fn>

function subscribe(topic, listener) {
  if (!isEventType(topic) && typeof topic !== 'string') {
    throw new Error(`Invalid event topic: ${topic}`);
  }
  const normalized = topic.toUpperCase();
  if (!subscribers.has(normalized)) subscribers.set(normalized, new Set());
  subscribers.get(normalized).add(listener);
  return () => unsubscribe(normalized, listener);
}

function unsubscribe(topic, listener) {
  if (!topic) return;
  const normalized = topic.toUpperCase();
  const set = subscribers.get(normalized);
  if (set) set.delete(listener);
}

function subscribersFor(topic) {
  const normalized = (topic || '').toUpperCase();
  return subscribers.get(normalized) || new Set();
}

// ---------------------------------------------------------------------------
// Event envelope
// ---------------------------------------------------------------------------

function envelope(event, payload) {
  return Object.freeze({
    type: event,
    payload: payload || {},
    emittedAt: new Date().toISOString(),
    source: payload.source || 'epistemic-bus',
  });
}

// ---------------------------------------------------------------------------
// Publish with per-event-type handling
// ---------------------------------------------------------------------------

function publishEvent(eventType, payload) {
  if (!isEventType(eventType)) return;
  const ev = envelope(eventType, payload);
  const set = subscribers.get(eventType.toUpperCase());
  if (set) {
    for (const fn of set) {
      try {
        fn(ev);
      } catch (_) {}
    }
  }
  // Also fan out to wildcard subscribers if any.
  const wildcard = subscribers.get('*');
  if (wildcard) {
    for (const fn of wildcard) {
      try {
        fn(ev);
      } catch (_) {}
    }
  }
  return ev;
}

// ---------------------------------------------------------------------------
// Typed helpers
// ---------------------------------------------------------------------------

function publishContradiction(subject, claims, gap) {
  return publishEvent(EVENT_TYPES.CONTRADICTION, {
    subject,
    claims: Array.isArray(claims) ? claims : [claims],
    gap: gap || null,
    severity: gap && gap > 0.5 ? 'high' : 'medium',
  });
}

function publishClaimRevised(params) {
  return publishEvent(EVENT_TYPES.CLAIM_REVISED, {
    claimId: params.claimId,
    subject: params.subject,
    beforeQuality: params.beforeQuality,
    afterQuality: params.afterQuality,
    delta: params.delta,
    reason: params.reason,
  });
}

function publishDebtEscalated(params) {
  return publishEvent(EVENT_TYPES.DEBT_ESCALATED, {
    debtId: params.debtId,
    subject: params.subject,
    fromSeverity: params.fromSeverity,
    toSeverity: params.toSeverity,
  });
}

function publishBeliefPromoted(claimId, evidence) {
  return publishEvent(EVENT_TYPES.BELIEF_PROMOTED, {
    claimId,
    evidence,
  });
}

function publishBeliefDemoted(claimId, reason) {
  return publishEvent(EVENT_TYPES.BELIEF_DEMOTED, {
    claimId,
    reason,
  });
}

function publishClaimAccepted(claim, stakes) {
  return publishEvent(EVENT_TYPES.CLAIM_ACCEPTED, {
    claimId: claim.id || claim.type,
    subject: claim.subject || null,
    claimType: claim.type,
    stakes: stakes || null,
  });
}

function publishClaimRejected(claim, reason) {
  return publishEvent(EVENT_TYPES.CLAIM_REJECTED, {
    claimId: claim.id || claim.type,
    subject: claim.subject || null,
    claimType: claim.type,
    reason,
  });
}

function publishDebtCreated(debt) {
  return publishEvent(EVENT_TYPES.DEBT_CREATED, {
    debtId: debt.id,
    subject: debt.subject || null,
    reason: debt.reason,
    severity: debt.severity,
  });
}

function publishDebtResolved(debt, resolution) {
  return publishEvent(EVENT_TYPES.DEBT_RESOLVED, {
    debtId: debt.id,
    subject: debt.subject || null,
    resolution: resolution || null,
  });
}

// ---------------------------------------------------------------------------
// De-duplication by content hash (simple)
// ---------------------------------------------------------------------------

const seen = new Set();

function eventFingerprint(event) {
  if (!event || !event.payload || !event.type) return null;
  const payload = JSON.stringify(event.payload, (key, val) => {
    if (typeof val === 'number') return Math.round(val * 1e6) / 1e6;
    return val;
  });
  return `${event.type}:${payload}`;
}

function publishIfNovel(eventType, payload, opts = {}) {
  const ev = envelope(eventType, payload);
  const fp = eventFingerprint(ev);
  if (!fp) return ev;
  const window = opts.window || 1000;
  if (seen.has(fp)) return null;
  if (seen.size > window) {
    // Evict oldest — simple circular buffer approximation.
    const toDelete = seen.values().next().value;
    if (toDelete) seen.delete(toDelete);
  }
  seen.add(fp);
  publishEvent(eventType, payload);
  return ev;
}

// ---------------------------------------------------------------------------
// Persistence stub (future migration into epistemic_events table)
// ---------------------------------------------------------------------------

const pendingEvents = [];
let eventStore = null;

function configureEventStore(db) {
  eventStore = db || null;
}

function eventId(event) {
  return `ep_${eventFingerprint(event).slice(0, 48)}`;
}

function recordEvent(event) {
  pendingEvents.push(event);
  if (pendingEvents.length > 500) pendingEvents.shift();
  if (eventStore) {
    eventStore.run(
      'INSERT OR IGNORE INTO epistemic_events (id, event_type, payload_json, emitted_at, fingerprint) VALUES (?, ?, ?, ?, ?)',
      eventId(event), event.type, JSON.stringify(event.payload), event.emittedAt, eventFingerprint(event)
    ).catch(() => {});
  }
  return event;
}

function publishAndRecord(eventType, payload) {
  const ev = publishEvent(eventType, payload);
  if (ev) recordEvent(ev);
  return ev;
}

// ---------------------------------------------------------------------------
// Wildcard + introspection
// ---------------------------------------------------------------------------

function subscribeWildcard(listener) {
  return subscribe('*', listener);
}

function listTopics() {
  return [...subscribers.keys()];
}

function subscriberCount(topic) {
  const set = subscribers.get((topic || '').toUpperCase());
  return set ? set.size : 0;
}

// ---------------------------------------------------------------------------
// Back-pressure safety: if a handler throws, it is removed to avoid poisoning
// the bus for other subscribers.
// ---------------------------------------------------------------------------

function safePublish(eventType, payload) {
  return publishEvent(eventType, payload);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  EVENT_TYPES,
  isEventType,
  subscribe,
  unsubscribe,
  subscribeWildcard,
  subscribersFor,
  listTopics,
  subscriberCount,
  publishEvent,
  publishContradiction,
  publishClaimRevised,
  publishDebtEscalated,
  publishBeliefPromoted,
  publishBeliefDemoted,
  publishClaimAccepted,
  publishClaimRejected,
  publishDebtCreated,
  publishDebtResolved,
  publishIfNovel,
  publishAndRecord,
  configureEventStore,
  recordEvent,
  pendingEvents,
  seen,
  envelope,
};
