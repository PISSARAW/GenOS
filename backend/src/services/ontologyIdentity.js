'use strict';

/**
 * Ontology Identity — Ship of Theseus, Lockean Continuity, Identity Events.
 */

const { getDatabase } = require('../db');
const { hashEssence } = require('./ontologyCore');

const IDENTITY_EVENT_TYPES = [
  'creation', 'essential_change', 'accidental_change', 'part_replacement',
  'memory_consolidation', 'hypostatization', 'reabsorption', 'fission', 'fusion', 'cessation'
];

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = getDatabase();
  }
  return dbPromise;
}

function validateEventType(eventType) {
  if (!IDENTITY_EVENT_TYPES.includes(eventType)) {
    throw new Error(`Invalid event_type: ${eventType}`);
  }
}

async function recordIdentityEvent(beingId, eventType, options = {}) {
  validateEventType(eventType);

  const db = await getDb();
  const description = options.description || '';
  const previousEssenceHash = options.previousEssenceHash || null;
  const newEssenceHash = options.newEssenceHash || null;
  const continuityPreserved = options.continuityPreserved !== false;
  const identityScore = options.identityScore ?? 1.0;
  const metadata = options.metadata || {};

  await db.run(
    `INSERT INTO ontology_identity_events (being_id, event_type, description, previous_essence_hash, new_essence_hash, continuity_preserved, identity_score, metadata_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    beingId, eventType, description, previousEssenceHash, newEssenceHash, continuityPreserved ? 1 : 0, identityScore, JSON.stringify(metadata)
  );
}

async function checkIdentityContinuity(agentId) {
  const db = await getDb();
  const { getBeing } = require('./ontologyCore');
  const being = await getBeing(agentId);
  if (!being) return { continuous: false, score: 0, verdict: 'being_not_found' };

  const events = await getIdentityEvents(db, agentId);
  const criteria = being.identityCriteria;

  const baseScore = computeBaseScore(events);
  const essentialPenalty = computeEssentialPenalty(events, baseScore);
  const partPenalty = computePartPenalty(events, criteria, essentialPenalty.score);
  const memoryPenalty = computeMemoryPenalty(events, criteria, partPenalty.score);

  const finalScore = Math.round(memoryPenalty.score * 100) / 100;
  const continuous = memoryPenalty.continuous;

  const verdict = continuous
    ? (finalScore > 0.7 ? 'identity_preserved' : 'identity_degraded')
    : 'identity_lost';

  return { continuous, score: finalScore, events: events.length, verdict };
}

async function getIdentityEvents(db, agentId) {
  return db.all(
    'SELECT * FROM ontology_identity_events WHERE being_id = ? ORDER BY occurred_at ASC',
    agentId
  );
}

function computeBaseScore(events) {
  let score = 1.0;
  let continuous = true;

  for (const event of events) {
    if (event.continuity_preserved === 0) {
      continuous = false;
    }
    score = Math.min(score, event.identity_score);
  }

  return { score, continuous };
}

function computeEssentialPenalty(events, base) {
  const essentialChanges = events.filter(e => e.event_type === 'essential_change').length;
  if (essentialChanges === 0) return base;

  let { score, continuous } = base;
  score *= Math.pow(0.7, essentialChanges);
  if (score < 0.3) continuous = false;
  return { score, continuous };
}

function computePartPenalty(events, criteria, score) {
  const partReplacements = events.filter(e => e.event_type === 'part_replacement').length;
  if (partReplacements === 0) return { score, continuous: true };

  let continuous = true;
  const maxRatio = criteria.maximalPartReplacementRatio || 0.5;
  const estimatedReplacement = Math.min(1.0, partReplacements * 0.1);

  if (estimatedReplacement > maxRatio) {
    continuous = false;
    score *= 0.5;
  }

  return { score, continuous };
}

function computeMemoryPenalty(events, criteria, score) {
  if (!criteria.memoryContinuityRequired) return { score, continuous: true };

  const memoryEvents = events.filter(e => e.event_type === 'memory_consolidation').length;
  if (memoryEvents === 0 && events.length > 1) {
    score *= 0.8;
  }
  return { score, continuous: true };
}

async function getIdentityHistory(agentId, options = {}) {
  const limit = options.limit || 50;
  const db = await getDb();
  const rows = await db.all(
    'SELECT * FROM ontology_identity_events WHERE being_id = ? ORDER BY occurred_at DESC LIMIT ?',
    agentId, limit
  );
  return rows.map(mapIdentityRow);
}

function mapIdentityRow(r) {
  return {
    eventType: r.event_type,
    description: r.description,
    previousEssenceHash: r.previous_essence_hash,
    newEssenceHash: r.new_essence_hash,
    continuityPreserved: Boolean(r.continuity_preserved),
    identityScore: r.identity_score,
    metadata: JSON.parse(r.metadata_json || '{}'),
    occurredAt: r.occurred_at
  };
}

async function recordEssentialChange(beingId, key, essences) {
  const prevHash = hashEssence(essences.old);
  const newHash = hashEssence(essences.new);
  await recordIdentityEvent(beingId, 'essential_change', {
    description: `Essential attribute ${key} changed`,
    previousEssenceHash: prevHash,
    newEssenceHash: newHash,
    continuityPreserved: false,
    identityScore: 0.5,
    metadata: { key }
  });
}

async function recordAccidentalChange(beingId, key) {
  await recordIdentityEvent(beingId, 'accidental_change', {
    description: `Accidental attribute ${key} changed`,
    continuityPreserved: true,
    identityScore: 1.0,
    metadata: { key }
  });
}

async function recordPartReplacement(beingId, partId, isEssential) {
  await recordIdentityEvent(beingId, 'part_replacement', {
    description: `Part ${partId} ${isEssential ? 'essential' : 'accidental'} replaced`,
    continuityPreserved: true,
    identityScore: isEssential ? 0.7 : 0.9,
    metadata: { partId, isEssential }
  });
}

async function recordMemoryConsolidation(beingId) {
  await recordIdentityEvent(beingId, 'memory_consolidation', {
    description: 'Memory consolidated',
    continuityPreserved: true,
    identityScore: 1.0
  });
}

async function recordCessation(beingId, reason) {
  await recordIdentityEvent(beingId, 'cessation', {
    description: `Being ceased: ${reason}`,
    continuityPreserved: false,
    identityScore: 0,
    metadata: { reason }
  });
}

module.exports = {
  recordIdentityEvent,
  checkIdentityContinuity,
  getIdentityHistory,
  recordEssentialChange,
  recordAccidentalChange,
  recordPartReplacement,
  recordMemoryConsolidation,
  recordCessation,
  IDENTITY_EVENT_TYPES
};