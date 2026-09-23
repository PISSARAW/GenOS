'use strict';

const crypto = require('crypto');
const { getDatabase } = require('../../db');

function hashOf(text) {
  return `sha256:${crypto.createHash('sha256').update(String(text)).digest('hex')}`;
}

function normalizePhrase(phrase) {
  return String(phrase || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

async function resolveDb(inputDb) {
  if (inputDb) return inputDb;
  return getDatabase();
}

async function ensureDialectTables(inputDb) {
  const db = await resolveDb(inputDb);
  await db.exec(`CREATE TABLE IF NOT EXISTS dialects (
    dialect_id TEXT PRIMARY KEY, participants_key TEXT NOT NULL,
    participant_a TEXT NOT NULL, participant_b TEXT NOT NULL,
    domain TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
    base_vocabulary TEXT NOT NULL DEFAULT 'genos-canonical-v3',
    common_ground_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    CHECK (participant_a < participant_b),
    CHECK (status IN ('active', 'retired'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_dialects_pair ON dialects(participants_key, domain);
  CREATE TABLE IF NOT EXISTS dialect_symbols (
    dialect_id TEXT NOT NULL, symbol TEXT NOT NULL,
    semantic_fingerprint TEXT NOT NULL, canonical_meaning TEXT NOT NULL,
    payload_schema_json TEXT NOT NULL DEFAULT '{}',
    use_count INTEGER NOT NULL DEFAULT 0, success_count INTEGER NOT NULL DEFAULT 0,
    confidence REAL NOT NULL DEFAULT 0.5,
    PRIMARY KEY (dialect_id, symbol)
  );
  CREATE TABLE IF NOT EXISTS dialect_candidates (
    id TEXT PRIMARY KEY, participants_key TEXT NOT NULL, domain TEXT NOT NULL,
    phrase_hash TEXT NOT NULL, phrase_sample TEXT NOT NULL,
    last_fingerprint TEXT NOT NULL, frequency INTEGER NOT NULL DEFAULT 1,
    variance_count INTEGER NOT NULL DEFAULT 0, success_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'proposed',
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP, last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('proposed', 'accepted', 'rejected'))
  );
  CREATE INDEX IF NOT EXISTS idx_dialect_candidates_pair ON dialect_candidates(participants_key, domain, status);`);
  return db;
}

function pairKey(agentA, agentB) {
  if (agentA < agentB) return `${agentA}\u0001${agentB}`;
  return `${agentB}\u0001${agentA}`;
}

function orderedParticipants(input) {
  const list = input.participants || [];
  if (!Array.isArray(list) || list.length !== 2) throw new Error('Dialect requires exactly two participants.');
  if (list[0] === list[1]) throw new Error('Dialect requires two distinct participants.');
  return list[0] < list[1] ? [list[0], list[1]] : [list[1], list[0]];
}

function deserializeDialect(row, symbols) {
  const table = {};
  for (const symbol of symbols) {
    table[symbol.symbol] = {
      semanticFingerprint: symbol.semantic_fingerprint,
      canonicalMeaning: symbol.canonical_meaning,
      payloadSchema: JSON.parse(symbol.payload_schema_json || '{}'),
      confidence: Number(symbol.confidence)
    };
  }
  return {
    dialectId: row.dialect_id,
    participants: [row.participant_a, row.participant_b],
    domain: row.domain,
    version: Number(row.version),
    baseVocabulary: row.base_vocabulary,
    symbols: table,
    commonGroundHash: row.common_ground_hash,
    status: row.status,
    expiresAt: row.expires_at || null
  };
}

async function symbolsOf(db, dialectId) {
  return db.all('SELECT * FROM dialect_symbols WHERE dialect_id = ? ORDER BY symbol ASC', [dialectId]);
}

async function loadDialectRow(db, dialectId) {
  const row = await db.get("SELECT * FROM dialects WHERE dialect_id = ? AND status = 'active'", [dialectId]);
  if (!row) throw new Error(`UNKNOWN_DIALECT: '${dialectId}' is not active.`);
  return row;
}

function recomputeHash(dialectId, version, symbols) {
  const canon = symbols.map((s) => `${s.symbol}:${s.semantic_fingerprint}`).sort().join('|');
  return hashOf(`${dialectId}|${version}|${canon}`);
}

async function bumpVersion(db, dialectId) {
  const row = await loadDialectRow(db, dialectId);
  const version = Number(row.version) + 1;
  const symbols = await symbolsOf(db, dialectId);
  const hash = recomputeHash(dialectId, version, symbols);
  await db.run(
    'UPDATE dialects SET version = ?, common_ground_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE dialect_id = ?',
    [version, hash, dialectId]
  );
  return version;
}

async function createDialect(input) {
  const db = await ensureDialectTables(input.db);
  const pair = orderedParticipants(input);
  const key = pairKey(pair[0], pair[1]);
  const existing = await db.get(
    "SELECT * FROM dialects WHERE participants_key = ? AND domain = ? AND status = 'active'",
    [key, input.domain]
  );
  if (existing) return getDialect({ db, dialectId: existing.dialect_id });
  const dialectId = `dialect-${pair[0]}-${pair[1]}-${String(input.domain).replace(/[^a-z0-9]+/gi, '.')}`;
  await db.run(
    `INSERT INTO dialects (dialect_id, participants_key, participant_a, participant_b, domain, version, base_vocabulary, common_ground_hash, status)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'active')`,
    [dialectId, key, pair[0], pair[1], input.domain, input.baseVocabulary || 'genos-canonical-v3', hashOf(`${dialectId}|1|`)]
  );
  return getDialect({ db, dialectId });
}

async function getDialect(input) {
  const db = await ensureDialectTables(input.db);
  const row = await loadDialectRow(db, input.dialectId);
  return deserializeDialect(row, await symbolsOf(db, input.dialectId));
}

async function findDialect(input) {
  const db = await ensureDialectTables(input.db);
  const pair = orderedParticipants(input);
  const row = await db.get(
    "SELECT * FROM dialects WHERE participants_key = ? AND domain = ? AND status = 'active'",
    [pairKey(pair[0], pair[1]), input.domain]
  );
  if (!row) return null;
  return deserializeDialect(row, await symbolsOf(db, row.dialect_id));
}

function assertSymbolArgs(input) {
  if (!String(input.symbol || '').trim()) throw new Error('Dialect symbol is required.');
  if (!String(input.semanticFingerprint || '').startsWith('sha256:')) {
    throw new Error('Dialect symbols bind a sha256: semantic fingerprint, never free text.');
  }
  if (!String(input.canonicalMeaning || '').trim()) throw new Error('Dialect symbol requires a canonical meaning.');
}

async function defineSymbol(input) {
  assertSymbolArgs(input);
  const db = await ensureDialectTables(input.db);
  await loadDialectRow(db, input.dialectId);
  await db.run(
    `INSERT INTO dialect_symbols (dialect_id, symbol, semantic_fingerprint, canonical_meaning, payload_schema_json)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(dialect_id, symbol) DO UPDATE SET semantic_fingerprint = excluded.semantic_fingerprint,
       canonical_meaning = excluded.canonical_meaning, payload_schema_json = excluded.payload_schema_json`,
    [input.dialectId, input.symbol, input.semanticFingerprint, input.canonicalMeaning,
      JSON.stringify(input.payloadSchema || {})]
  );
  await bumpVersion(db, input.dialectId);
  return getDialect({ db, dialectId: input.dialectId });
}

async function retireSymbol(input) {
  const db = await ensureDialectTables(input.db);
  await loadDialectRow(db, input.dialectId);
  const result = await db.run('DELETE FROM dialect_symbols WHERE dialect_id = ? AND symbol = ?', [input.dialectId, input.symbol]);
  if (!result.changes) throw new Error(`UNKNOWN_SYMBOL: '${input.symbol}' is not defined.`);
  await bumpVersion(db, input.dialectId);
  return getDialect({ db, dialectId: input.dialectId });
}

async function encode(input) {
  const db = await ensureDialectTables(input.db);
  const dialect = await loadDialectRow(db, input.dialectId);
  const row = await db.get(
    'SELECT symbol FROM dialect_symbols WHERE dialect_id = ? AND semantic_fingerprint = ?',
    [input.dialectId, input.semanticFingerprint]
  );
  if (!row) throw new Error(`UNKNOWN_SYMBOL: no symbol binds '${input.semanticFingerprint}'. Fall back to canonical.`);
  return { dialectId: input.dialectId, symbol: row.symbol, version: Number(dialect.version) };
}

async function decode(input) {
  const db = await ensureDialectTables(input.db);
  const dialect = await loadDialectRow(db, input.dialectId);
  if (input.version !== undefined && Number(input.version) !== Number(dialect.version)) {
    throw new Error(`UNKNOWN_DIALECT_VERSION: holds v${dialect.version}, offered v${input.version}. Fall back to canonical.`);
  }
  const row = await db.get(
    'SELECT * FROM dialect_symbols WHERE dialect_id = ? AND symbol = ?',
    [input.dialectId, input.symbol]
  );
  if (!row) throw new Error(`UNKNOWN_SYMBOL: '${input.symbol}' is not defined. Never guess on a critical path.`);
  return {
    dialectId: input.dialectId, symbol: row.symbol, version: Number(dialect.version),
    semanticFingerprint: row.semantic_fingerprint, canonicalMeaning: row.canonical_meaning,
    payloadSchema: JSON.parse(row.payload_schema_json || '{}'), confidence: Number(row.confidence)
  };
}

async function recordUsage(input) {
  const db = await ensureDialectTables(input.db);
  const delta = input.success ? 1 : 0;
  const result = await db.run(
    `UPDATE dialect_symbols SET use_count = use_count + 1, success_count = success_count + ?,
       confidence = CAST(success_count + ? AS REAL) / (use_count + 1)
     WHERE dialect_id = ? AND symbol = ?`,
    [delta, delta, input.dialectId, input.symbol]
  );
  if (!result.changes) throw new Error(`UNKNOWN_SYMBOL: '${input.symbol}' is not defined.`);
  return decode({ db, dialectId: input.dialectId, symbol: input.symbol });
}

async function observePhrase(input) {
  const db = await ensureDialectTables(input.db);
  const pair = orderedParticipants(input);
  const key = pairKey(pair[0], pair[1]);
  const phraseHash = hashOf(normalizePhrase(input.phrase));
  const row = await db.get(
    'SELECT * FROM dialect_candidates WHERE participants_key = ? AND domain = ? AND phrase_hash = ?',
    [key, input.domain, phraseHash]
  );
  if (!row) {
    const id = `cand_${crypto.randomUUID()}`;
    await db.run(
      `INSERT INTO dialect_candidates (id, participants_key, domain, phrase_hash, phrase_sample, last_fingerprint, frequency, variance_count, success_count, status)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, 'proposed')`,
      [id, key, input.domain, phraseHash, String(input.phrase).slice(0, 280), input.semanticFingerprint, input.success ? 1 : 0]
    );
    return { id, frequency: 1, variance: 0, status: 'proposed' };
  }
  const drifted = row.last_fingerprint !== input.semanticFingerprint ? 1 : 0;
  await db.run(
    `UPDATE dialect_candidates SET frequency = frequency + 1, variance_count = variance_count + ?,
       success_count = success_count + ?, last_fingerprint = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?`,
    [drifted, input.success ? 1 : 0, input.semanticFingerprint, row.id]
  );
  const frequency = Number(row.frequency) + 1;
  return { id: row.id, frequency, variance: (Number(row.variance_count) + drifted) / frequency, status: row.status };
}

async function compilationCandidates(input) {
  const db = await ensureDialectTables(input.db);
  const rows = await db.all(
    `SELECT * FROM dialect_candidates WHERE status = 'proposed' AND frequency >= ? ORDER BY frequency DESC LIMIT 100`,
    [Number(input.minFrequency || 3)]
  );
  const maxVariance = input.maxVariance === undefined ? 0.2 : Number(input.maxVariance);
  const minSuccess = Number(input.minSuccess || 2);
  const matches = [];
  for (const row of rows) {
    const variance = Number(row.frequency) > 0 ? Number(row.variance_count) / Number(row.frequency) : 1;
    if (variance <= maxVariance && Number(row.success_count) >= minSuccess) matches.push(deserializeCandidate(row, variance));
  }
  return matches;
}

function deserializeCandidate(row, variance) {
  return {
    id: row.id, participantsKey: row.participants_key, domain: row.domain,
    phraseHash: row.phrase_hash, phraseSample: row.phrase_sample,
    lastFingerprint: row.last_fingerprint, frequency: Number(row.frequency),
    variance, successCount: Number(row.success_count), status: row.status
  };
}

async function acceptCandidate(input) {
  const db = await ensureDialectTables(input.db);
  const row = await db.get("SELECT * FROM dialect_candidates WHERE id = ? AND status = 'proposed'", [input.candidateId]);
  if (!row) throw new Error(`Candidate '${input.candidateId}' is not available.`);
  await defineSymbol({
    db, dialectId: input.dialectId, symbol: input.symbol,
    semanticFingerprint: row.last_fingerprint, canonicalMeaning: row.phrase_sample, payloadSchema: input.payloadSchema
  });
  await db.run("UPDATE dialect_candidates SET status = 'accepted' WHERE id = ?", [input.candidateId]);
  return getDialect({ db, dialectId: input.dialectId });
}

module.exports = {
  ensureDialectTables,
  createDialect,
  getDialect,
  findDialect,
  defineSymbol,
  retireSymbol,
  encode,
  decode,
  recordUsage,
  observePhrase,
  compilationCandidates,
  acceptCandidate
};
