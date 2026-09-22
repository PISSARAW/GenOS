/**
 * Genome Event Log — event sourcing unifié pour l'ADN des agents.
 *
 * Chaque modification héréditaire d'un AgentDNA produit un événement.
 * Les types couverts : BIRTH, CROSSOVER, MUTATION, GRAFT, CLONE,
 * EPIGENETIC_CHANGE, PROMOTION, REJECTION, EXTINCTION
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
      commit_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      organization_id TEXT,
      project_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_genome_events_genome_ref ON genome_events(genome_ref);
    CREATE INDEX IF NOT EXISTS idx_genome_events_type ON genome_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_genome_events_commit_id ON genome_events(commit_id);
  `);
}

async function recordEvent(db, event) {
  const { genome_ref, event_type, payload, organization_id, project_id, commit_id } = event;
  if (!genome_ref || !event_type || !EVENT_TYPES.has(event_type)) {
    throw new Error(`Invalid genome event: ${JSON.stringify(event)}`);
  }
  const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  await db.run(
    `INSERT INTO genome_events (id, genome_ref, event_type, payload_json, parent_event_id, commit_id, organization_id, project_id)
     VALUES (?,?,?,?,?,?,?,?)`,
    id,
    genome_ref,
    event_type,
    JSON.stringify(payload || {}),
    event.parent_event_id || null,
    commit_id || null,
    organization_id || null,
    project_id || null
  );
  return { id, genome_ref, event_type, commit_id: commit_id || null };
}

function makeEvent(type, genomeRef, opts) {
  const { parentRefs = null, payload = {}, organizationId = null, projectId = null } = opts || {};
  return {
    genome_ref: genomeRef,
    event_type: type,
    parent_event_id: Array.isArray(parentRefs) && parentRefs.length ? parentRefs[0] : null,
    payload: { ...payload, event_subtype: type.toLowerCase() },
    organization_id: organizationId,
    project_id: projectId,
  };
}

async function recordBirth(db, genomeRef, opts) {
  return recordEvent(db, makeEvent('BIRTH', genomeRef, opts));
}

async function recordCrossover(db, genomeRef, opts) {
  return recordEvent(db, makeEvent('CROSSOVER', genomeRef, opts));
}

async function recordMutation(db, genomeRef, opts) {
  return recordEvent(db, makeEvent('MUTATION', genomeRef, opts));
}

async function recordGraft(db, genomeRef, opts) {
  return recordEvent(db, makeEvent('GRAFT', genomeRef, opts));
}

async function recordClone(db, genomeRef, opts) {
  return recordEvent(db, makeEvent('CLONE', genomeRef, opts));
}

async function recordPromotion(db, genomeRef, opts) {
  return recordEvent(db, makeEvent('PROMOTION', genomeRef, opts));
}

async function recordRejection(db, genomeRef, opts) {
  return recordEvent(db, makeEvent('REJECTION', genomeRef, opts));
}

async function recordExtinction(db, genomeRef, opts) {
  return recordEvent(db, makeEvent('EXTINCTION', genomeRef, opts));
}

module.exports = {
  ensureTable,
  recordEvent,
  recordBirth,
  recordCrossover,
  recordMutation,
  recordGraft,
  recordClone,
  recordPromotion,
  recordRejection,
  recordExtinction,
  makeEvent,
  EVENT_TYPES
};
