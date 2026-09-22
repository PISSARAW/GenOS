/**
 * Genome Event Log — event sourcing unifié pour l'ADN des agents.
 */

const { getDatabase } = require('../db');

const EVENT_TYPES = new Set([
  'BIRTH','CROSSOVER','MUTATION','GRAFT','CLONE','DECOY',
  'EPIGENETIC_CHANGE','PROMOTION','REJECTION','EXTINCTION'
]);

async function ensureTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS genome_events (
      id TEXT PRIMARY KEY,
      genome_ref TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      parent_event_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      organization_id TEXT,
      project_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_genome_events_genome_ref ON genome_events(genome_ref);
    CREATE INDEX IF NOT EXISTS idx_genome_events_type ON genome_events(event_type);
  `);
}

async function logEvent(db, event) {
  const { genome_ref, event_type, payload, parent_event_id, organization_id, project_id } = event;
  if (!genome_ref || !event_type || !EVENT_TYPES.has(event_type)) {
    throw new Error(`Invalid genome event: ${JSON.stringify(event)}`);
  }
  const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  await db.run(
    `INSERT INTO genome_events (id, genome_ref, event_type, payload_json, parent_event_id, organization_id, project_id)
     VALUES (?,?,?,?,?,?,?)`,
    id, genome_ref, event_type, JSON.stringify(payload || {}), parent_event_id || null, organization_id || null, project_id || null
  );
  return { id, genome_ref, event_type };
}

async function recordBirth(db, genomeRef, parentRefs, payload, scope) {
  return logEvent(db, {
    genome_ref: genomeRef,
    event_type: 'BIRTH',
    payload: { ...payload, event_subtype: 'birth' },
    parent_event_id: null,
    organization_id: scope.organizationId,
    project_id: scope.projectId
  });
}

async function recordCrossover(db, genomeRef, parentRefs, payload, scope) {
  return logEvent(db, {
    genome_ref: genomeRef,
    event_type: 'CROSSOVER',
    payload: { ...payload, event_subtype: 'crossover' },
    parent_event_id: null,
    organization_id: scope.organizationId,
    project_id: scope.projectId
  });
}

async function recordMutation(db, genomeRef, payload, scope) {
  return logEvent(db, {
    genome_ref: genomeRef,
    event_type: 'MUTATION',
    payload: { ...payload, event_subtype: 'mutation' },
    parent_event_id: null,
    organization_id: scope.organizationId,
    project_id: scope.projectId
  });
}

async function recordGraft(db, genomeRef, payload, scope) {
  return logEvent(db, {
    genome_ref: genomeRef,
    event_type: 'GRAFT',
    payload: { ...payload, event_subtype: 'graft' },
    parent_event_id: null,
    organization_id: scope.organizationId,
    project_id: scope.projectId
  });
}

async function recordClone(db, genomeRef, payload, scope) {
  return logEvent(db, {
    genome_ref: genomeRef,
    event_type: 'CLONE',
    payload: { ...payload, event_subtype: 'clone' },
    parent_event_id: null,
    organization_id: scope.organizationId,
    project_id: scope.projectId
  });
}

async function recordPromotion(db, genomeRef, payload, scope) {
  return logEvent(db, {
    genome_ref: genomeRef,
    event_type: 'PROMOTION',
    payload: { ...payload, event_subtype: 'promotion' },
    parent_event_id: null,
    organization_id: scope.organizationId,
    project_id: scope.projectId
  });
}

async function recordRejection(db, genomeRef, payload, scope) {
  return logEvent(db, {
    genome_ref: genomeRef,
    event_type: 'REJECTION',
    payload: { ...payload, event_subtype: 'rejection' },
    parent_event_id: null,
    organization_id: scope.organizationId,
    project_id: scope.projectId
  });
}

async function recordExtinction(db, genomeRef, payload, scope) {
  return logEvent(db, {
    genome_ref: genomeRef,
    event_type: 'EXTINCTION',
    payload: { ...payload, event_subtype: 'extinction' },
    parent_event_id: null,
    organization_id: scope.organizationId,
    project_id: scope.projectId
  });
}

module.exports = {
  ensureTable,
  logEvent,
  recordBirth,
  recordCrossover,
  recordMutation,
  recordGraft,
  recordClone,
  recordPromotion,
  recordRejection,
  recordExtinction,
  EVENT_TYPES
};
