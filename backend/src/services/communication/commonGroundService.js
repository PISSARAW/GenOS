'use strict';

const { getDatabase } = require('../../db');

const GROUND_STATUSES = new Set(['proposed', 'grounded', 'stale', 'revoked', 'contradicted']);
const INVALIDATION_STATUSES = new Set(['stale', 'revoked', 'contradicted']);

async function resolveDb(inputDb) {
  if (inputDb) return inputDb;
  return getDatabase();
}

async function ensureTables(inputDb) {
  const db = await resolveDb(inputDb);
  await db.exec(`CREATE TABLE IF NOT EXISTS communication_common_ground (
    agent_a TEXT NOT NULL, agent_b TEXT NOT NULL, domain TEXT NOT NULL,
    semantic_fingerprint TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'proposed',
    confidence REAL NOT NULL DEFAULT 0, grounded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP, expires_at DATETIME,
    provenance_json TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (agent_a, agent_b, domain, semantic_fingerprint),
    CHECK (agent_a < agent_b),
    CHECK (status IN ('proposed', 'grounded', 'stale', 'revoked', 'contradicted')),
    CHECK (json_valid(provenance_json))
  );
  CREATE INDEX IF NOT EXISTS idx_common_ground_pair
    ON communication_common_ground(agent_a, agent_b, domain, status);
  CREATE INDEX IF NOT EXISTS idx_common_ground_print
    ON communication_common_ground(semantic_fingerprint, status);`);
  return db;
}

function orderedPair(agentA, agentB) {
  if (agentA < agentB) return [agentA, agentB];
  return [agentB, agentA];
}

function assertGroundStatus(status) {
  if (!GROUND_STATUSES.has(status)) throw new Error(`Unsupported ground status '${status}'.`);
}

function assertInvalidationStatus(status) {
  if (!INVALIDATION_STATUSES.has(status)) throw new Error(`Status '${status}' cannot invalidate ground.`);
}

function expiryOf(ttlMs) {
  if (!ttlMs) return null;
  return new Date(Date.now() + Number(ttlMs)).toISOString();
}

function deserializeEntry(row) {
  return {
    agentA: row.agent_a,
    agentB: row.agent_b,
    domain: row.domain,
    semanticFingerprint: row.semantic_fingerprint,
    status: row.status,
    confidence: Number(row.confidence),
    groundedAt: row.grounded_at,
    lastConfirmedAt: row.last_confirmed_at,
    expiresAt: row.expires_at,
    provenance: JSON.parse(row.provenance_json || '{}')
  };
}

async function getEntry(query) {
  const row = await query.db.get(
    `SELECT * FROM communication_common_ground
     WHERE agent_a = ? AND agent_b = ? AND domain = ? AND semantic_fingerprint = ?`,
    [query.pair[0], query.pair[1], query.domain, query.fingerprint]
  );
  if (!row) return null;
  return deserializeEntry(row);
}

async function recordGrounding(input) {
  assertGroundStatus(input.status);
  const db = await ensureTables(input.db);
  const pair = orderedPair(input.agentA, input.agentB);
  await db.run(
    `INSERT INTO communication_common_ground
      (agent_a, agent_b, domain, semantic_fingerprint, status, confidence,
       grounded_at, last_confirmed_at, expires_at, provenance_json)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)
     ON CONFLICT(agent_a, agent_b, domain, semantic_fingerprint) DO UPDATE SET
       status = excluded.status, confidence = excluded.confidence,
       last_confirmed_at = CURRENT_TIMESTAMP, expires_at = excluded.expires_at,
       provenance_json = excluded.provenance_json`,
    [pair[0], pair[1], input.domain, input.semanticFingerprint, input.status,
      Number(input.confidence || 0), expiryOf(input.ttlMs), JSON.stringify(input.provenance || {})]
  );
  return getEntry({ db, pair, domain: input.domain, fingerprint: input.semanticFingerprint });
}

async function knows(input) {
  const db = await ensureTables(input.db);
  const row = await db.get(
    `SELECT 1 AS ok FROM communication_common_ground
     WHERE ((agent_a = ? AND agent_b = ?) OR (agent_a = ? AND agent_b = ?))
       AND semantic_fingerprint = ? AND status = 'grounded' LIMIT 1`,
    [input.agentA, input.agentB, input.agentB, input.agentA, input.semanticFingerprint]
  );
  return Boolean(row);
}

async function getSharedGround(input) {
  const db = await ensureTables(input.db);
  const rows = await db.all(
    `SELECT * FROM communication_common_ground
     WHERE ((agent_a = ? AND agent_b = ?) OR (agent_a = ? AND agent_b = ?))
       AND domain = ? AND status = 'grounded'
     ORDER BY semantic_fingerprint ASC`,
    [input.agentA, input.agentB, input.agentB, input.agentA, input.domain]
  );
  return rows.map(deserializeEntry);
}

async function receiverPrints(db, query) {
  const rows = await db.all(
    `SELECT semantic_fingerprint AS fp FROM communication_common_ground
     WHERE ((agent_a = ? AND agent_b = ?) OR (agent_a = ? AND agent_b = ?))
       AND status = 'grounded'`,
    [query.senderId, query.receiverId, query.receiverId, query.senderId]
  );
  return new Set(rows.map((row) => row.fp));
}

async function computeKnowledgeDelta(input) {
  const db = await ensureTables(input.db);
  const known = await receiverPrints(db, input);
  const refs = input.semanticRefs || [];
  return refs.filter((ref) => !known.has(ref));
}

async function invalidateGround(input) {
  assertInvalidationStatus(input.status);
  const db = await ensureTables(input.db);
  const pair = orderedPair(input.agentA, input.agentB);
  await db.run(
    `UPDATE communication_common_ground
     SET status = ?, last_confirmed_at = CURRENT_TIMESTAMP
     WHERE agent_a = ? AND agent_b = ? AND domain = ? AND semantic_fingerprint = ?`,
    [input.status, pair[0], pair[1], input.domain, input.semanticFingerprint]
  );
  return getEntry({ db, pair, domain: input.domain, fingerprint: input.semanticFingerprint });
}

function pairList(ids) {
  const pairs = [];
  for (let index = 0; index < ids.length; index += 1) {
    collectPairs(ids, index, pairs);
  }
  return pairs;
}

function collectPairs(ids, index, pairs) {
  for (let other = index + 1; other < ids.length; other += 1) {
    pairs.push([ids[index], ids[other]]);
  }
}

async function pairPrints(db, pair, domain) {
  const rows = await db.all(
    `SELECT semantic_fingerprint AS fp FROM communication_common_ground
     WHERE agent_a = ? AND agent_b = ? AND domain = ? AND status = 'grounded'`,
    [pair[0], pair[1], domain]
  );
  return new Set(rows.map((row) => row.fp));
}

function containedInAll(fingerprint, sets) {
  for (const set of sets) {
    if (!set.has(fingerprint)) return false;
  }
  return true;
}

function intersectAll(sets) {
  if (sets.length === 0) return [];
  const first = [...sets[0]];
  return first.filter((fingerprint) => containedInAll(fingerprint, sets));
}

async function computeGroupGrounding(input) {
  const db = await ensureTables(input.db);
  const ids = [...new Set(input.agentIds || [])].sort();
  const pairs = pairList(ids);
  const sets = [];
  for (const pair of pairs) {
    sets.push(await pairPrints(db, pair, input.domain));
  }
  return intersectAll(sets);
}

module.exports = {
  GROUND_STATUSES,
  ensureTables,
  recordGrounding,
  knows,
  getSharedGround,
  computeKnowledgeDelta,
  invalidateGround,
  computeGroupGrounding
};
