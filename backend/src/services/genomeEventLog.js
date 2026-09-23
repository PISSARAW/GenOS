/**
 * Genome Event Log — event sourcing unifié pour l'ADN des agents.
 *
 * Chaque modification héréditaire d'un AgentDNA produit un événement.
 * Les types couverts : BIRTH, CROSSOVER, MUTATION, GRAFT, CLONE,
 * EPIGENETIC_CHANGE, PROMOTION, REJECTION, EXTINCTION
 *
 * Chaîne cryptographique : H_n = H(H_{n-1} || Event_n).
 * Les références de génomes parents (parent_genome_refs) sont séparées
 * de l'identifiant d'événement précédent (previous_event_id).
 */

const crypto = require('crypto');

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
  await ensureColumn(db, 'previous_event_id', 'TEXT');
  await ensureColumn(db, 'parent_genome_refs', 'TEXT');
  await ensureColumn(db, 'prev_event_hash', 'TEXT');
  await ensureColumn(db, 'event_hash', 'TEXT');
}

async function ensureColumn(db, name, type) {
  try {
    await db.exec(`ALTER TABLE genome_events ADD COLUMN ${name} ${type}`);
  } catch (_) {
    // Colonne déjà présente.
  }
}

function chainHash(previous, canonical) {
  return crypto.createHash('sha256').update(`${previous || 'GENESIS'}||${canonical}`).digest('hex');
}

function canonicalEvent(event) {
  return JSON.stringify({
    genome_ref: event.genome_ref,
    event_type: event.event_type,
    payload: event.payload || {},
    parent_genome_refs: event.parent_genome_refs || [],
    commit_id: event.commit_id || null
  });
}

async function latestHash(db, genomeRef) {
  try {
    const row = await db.get(
      'SELECT event_hash FROM genome_events WHERE genome_ref = ? AND event_hash IS NOT NULL ORDER BY created_at DESC, rowid DESC LIMIT 1',
      genomeRef
    );
    return (row && row.event_hash) || null;
  } catch (_) {
    return null;
  }
}

async function recordEvent(db, event) {
  const { genome_ref, event_type, payload, organization_id, project_id, commit_id } = event;
  if (!genome_ref || !event_type || !EVENT_TYPES.has(event_type)) {
    throw new Error(`Invalid genome event: ${JSON.stringify(event)}`);
  }
  const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const previous = event.previous_event_id || null;
  const parentRefs = normalizeParentRefs(event.parent_genome_refs || event.parentRefs);
  const prevHash = await latestHash(db, genome_ref);
  const hash = chainHash(prevHash, canonicalEvent({ ...event, parent_genome_refs: parentRefs }));
  await db.run(
    `INSERT INTO genome_events (id, genome_ref, event_type, payload_json, parent_event_id, previous_event_id, parent_genome_refs, prev_event_hash, event_hash, commit_id, organization_id, project_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    id,
    genome_ref,
    event_type,
    JSON.stringify(payload || {}),
    previous,
    previous,
    JSON.stringify(parentRefs),
    prevHash,
    hash,
    commit_id || null,
    organization_id || null,
    project_id || null
  );
  return { id, genome_ref, event_type, commit_id: commit_id || null, eventHash: hash, previousEventId: previous };
}

function normalizeParentRefs(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry)).filter(Boolean);
}

function makeEvent(type, genomeRef, opts) {
  const { payload = {}, organizationId = null, projectId = null } = opts || {};
  const parentRefs = normalizeParentRefs((opts && (opts.parentGenomeRefs || opts.parentRefs)) || null);
  const previous = (opts && (opts.previousEventId || opts.previous_event_id)) || null;
  return {
    genome_ref: genomeRef,
    event_type: type,
    previous_event_id: previous,
    parent_event_id: previous,
    parent_genome_refs: parentRefs,
    parentRefs,
    payload: { ...payload, event_subtype: type.toLowerCase(), parent_genome_refs: parentRefs },
    organization_id: organizationId,
    project_id: projectId,
    // Point 13 : propager le commit Agent Git lié (accepte les deux casse).
    commit_id: opts?.commit_id ?? opts?.commitId ?? null
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
  chainHash,
  EVENT_TYPES
};
