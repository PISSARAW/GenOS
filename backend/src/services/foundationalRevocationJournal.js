'use strict';

const revocations = require('./foundationalRevocationAuthority');

const GENESIS_HASH = revocations.GENESIS_HASH;

function failure(code) {
  return Object.assign(new Error(code), { code });
}

async function ensureSchema(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS foundational_revocation_entries (
    stream_id TEXT NOT NULL, sequence INTEGER NOT NULL, entry_hash TEXT NOT NULL,
    entry_json TEXT NOT NULL, previous_hash TEXT NOT NULL,
    PRIMARY KEY (stream_id, sequence), UNIQUE (stream_id, entry_hash));
    CREATE TABLE IF NOT EXISTS foundational_revocation_heads (
    stream_id TEXT PRIMARY KEY, sequence INTEGER NOT NULL, head_hash TEXT NOT NULL,
    revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS foundational_revocation_anchors (
    stream_id TEXT PRIMARY KEY, sequence INTEGER NOT NULL, head_hash TEXT NOT NULL,
    revision INTEGER NOT NULL);`);
}

async function transaction(db, operation) {
  await db.exec('BEGIN IMMEDIATE');
  try {
    const result = await operation();
    await db.exec('COMMIT');
    return result;
  } catch (error) {
    try { await db.exec('ROLLBACK'); } catch (_) {}
    throw error;
  }
}

async function localState(db, streamId) {
  await ensureSchema(db);
  const head = await db.get(`SELECT sequence, head_hash AS headHash, revision
    FROM foundational_revocation_heads WHERE stream_id = ?`, streamId);
  const rows = await db.all(`SELECT sequence, entry_hash AS entryHash, entry_json AS entryJson,
    previous_hash AS previousHash FROM foundational_revocation_entries
    WHERE stream_id = ? ORDER BY sequence`, streamId);
  const entries = rows.map((row) => JSON.parse(row.entryJson));
  return { head: head || { sequence: 0, headHash: GENESIS_HASH, revision: 0 }, entries };
}

function validateLocalState(state) {
  if (state.entries.length !== state.head.sequence) {
    throw failure('FOUNDATION_REVOCATION_LOCAL_STATE_INVALID');
  }
  let previousHash = GENESIS_HASH;
  for (let index = 0; index < state.entries.length; index += 1) {
    const entry = state.entries[index];
    if (entry.sequence !== index + 1 || entry.previousHash !== previousHash) {
      throw failure('FOUNDATION_REVOCATION_LOCAL_STATE_INVALID');
    }
    previousHash = entry.entryHash;
  }
  if (previousHash !== state.head.headHash) {
    throw failure('FOUNDATION_REVOCATION_LOCAL_STATE_INVALID');
  }
}

function validateCandidate(input) {
  const ledger = { schema: revocations.LEDGER_SCHEMA,
    revocations: [...input.state.entries, input.entry] };
  validateLedger(ledger, input);
}

function validateLedger(ledger, input) {
  const inspected = revocations.inspect({ ledger, trustRegistry: input.trustRegistry,
    now: input.now });
  if (!inspected.valid) throw failure(inspected.reason);
}

function existingResult(state, entry) {
  const existing = state.entries.find((candidate) => candidate.entryHash === entry.entryHash);
  if (!existing) return null;
  if (JSON.stringify(existing) !== JSON.stringify(entry)) {
    throw failure('FOUNDATION_REVOCATION_IDEMPOTENCY_CONFLICT');
  }
  return { duplicate: true, head: state.head, previousHead: {
    sequence: entry.sequence - 1, headHash: entry.previousHash } };
}

function assertExpectedHead(state, input) {
  if (state.head.sequence !== input.expectedSequence
    || state.head.headHash !== input.expectedHeadHash) {
    throw failure('FOUNDATION_REVOCATION_CAS_CONFLICT');
  }
  if (input.entry.sequence !== state.head.sequence + 1
    || input.entry.previousHash !== state.head.headHash) {
    throw failure('FOUNDATION_REVOCATION_CHAIN_INVALID');
  }
}

async function insertEntry(db, input) {
  await db.run(`INSERT INTO foundational_revocation_entries
    (stream_id, sequence, entry_hash, entry_json, previous_hash) VALUES (?, ?, ?, ?, ?)`,
  input.streamId, input.entry.sequence, input.entry.entryHash,
  JSON.stringify(input.entry), input.entry.previousHash);
  if (input.state.head.sequence === 0) {
    await db.run(`INSERT INTO foundational_revocation_heads
      (stream_id, sequence, head_hash, revision) VALUES (?, ?, ?, 1)`,
    input.streamId, input.entry.sequence, input.entry.entryHash);
    return;
  }
  const result = await db.run(`UPDATE foundational_revocation_heads
    SET sequence = ?, head_hash = ?, revision = revision + 1
    WHERE stream_id = ? AND sequence = ? AND head_hash = ?`,
  input.entry.sequence, input.entry.entryHash, input.streamId,
  input.state.head.sequence, input.state.head.headHash);
  if (result.changes !== 1) throw failure('FOUNDATION_REVOCATION_CAS_CONFLICT');
}

async function appendLocal(input) {
  await ensureSchema(input.db);
  return transaction(input.db, async () => {
    const state = await localState(input.db, input.streamId);
    validateLocalState(state);
    validateLedger({ schema: revocations.LEDGER_SCHEMA, revocations: state.entries }, input);
    const duplicate = existingResult(state, input.entry);
    if (duplicate) return duplicate;
    assertExpectedHead(state, input);
    validateCandidate({ state, entry: input.entry,
      trustRegistry: input.trustRegistry, now: input.now });
    await insertEntry(input.db, { ...input, state });
    return { duplicate: false,
      head: { sequence: input.entry.sequence, headHash: input.entry.entryHash },
      previousHead: state.head };
  });
}

async function anchorState(db, streamId) {
  await ensureSchema(db);
  return (await db.get(`SELECT sequence, head_hash AS headHash, revision
    FROM foundational_revocation_anchors WHERE stream_id = ?`, streamId))
    || { sequence: 0, headHash: GENESIS_HASH, revision: 0 };
}

async function anchorHead(input) {
  await ensureSchema(input.db);
  return transaction(input.db, async () => {
    const current = await anchorState(input.db, input.streamId);
    if (current.sequence === input.head.sequence && current.headHash === input.head.headHash) {
      return { duplicate: true, head: current };
    }
    if (current.sequence !== input.previousHead.sequence
      || current.headHash !== input.previousHead.headHash
      || input.head.sequence <= current.sequence) {
      throw failure('FOUNDATION_REVOCATION_ANCHOR_CONFLICT');
    }
    if (current.sequence === 0) {
      await input.db.run(`INSERT INTO foundational_revocation_anchors
        (stream_id, sequence, head_hash, revision) VALUES (?, ?, ?, 1)`,
      input.streamId, input.head.sequence, input.head.headHash);
    } else {
      const result = await input.db.run(`UPDATE foundational_revocation_anchors
        SET sequence = ?, head_hash = ?, revision = revision + 1
        WHERE stream_id = ? AND sequence = ? AND head_hash = ?`,
      input.head.sequence, input.head.headHash, input.streamId,
      current.sequence, current.headHash);
      if (result.changes !== 1) throw failure('FOUNDATION_REVOCATION_ANCHOR_CONFLICT');
    }
    return { duplicate: false, head: input.head };
  });
}

async function append(input) {
  const committed = await appendLocal(input);
  const anchored = await anchorHead({ db: input.anchorDb, streamId: input.streamId,
    head: committed.head, previousHead: committed.previousHead });
  return { ...committed, anchored: true, anchorDuplicate: anchored.duplicate };
}

async function inspect(input) {
  const state = await localState(input.db, input.streamId);
  validateLocalState(state);
  const anchor = await anchorState(input.anchorDb, input.streamId);
  if (state.head.sequence !== anchor.sequence || state.head.headHash !== anchor.headHash) {
    throw failure('FOUNDATION_REVOCATION_ROLLBACK_DETECTED');
  }
  const result = revocations.inspect({ ledger: { schema: revocations.LEDGER_SCHEMA,
    revocations: state.entries }, trustRegistry: input.trustRegistry, now: input.now });
  if (!result.valid) throw failure(result.reason);
  return { ...result, sequence: state.head.sequence, entries: state.entries };
}

async function recoverAnchor(input) {
  const state = await localState(input.db, input.streamId);
  validateLocalState(state);
  const anchor = await anchorState(input.anchorDb, input.streamId);
  if (anchor.sequence > state.head.sequence) {
    throw failure('FOUNDATION_REVOCATION_ROLLBACK_DETECTED');
  }
  const historical = anchor.sequence === 0 ? GENESIS_HASH
    : state.entries[anchor.sequence - 1]?.entryHash;
  if (historical !== anchor.headHash) throw failure('FOUNDATION_REVOCATION_DIVERGENCE');
  const verified = revocations.inspect({ ledger: { schema: revocations.LEDGER_SCHEMA,
    revocations: state.entries }, trustRegistry: input.trustRegistry, now: input.now });
  if (!verified.valid) throw failure(verified.reason);
  await anchorHead({ db: input.anchorDb, streamId: input.streamId,
    head: state.head, previousHead: anchor });
  return { recovered: true, head: state.head };
}

async function replicate(input) {
  const source = await inspect({ db: input.sourceDb, anchorDb: input.sourceAnchorDb,
    streamId: input.streamId, trustRegistry: input.trustRegistry, now: input.now });
  let target = await localState(input.targetDb, input.streamId);
  validateLocalState(target);
  assertReplicationPrefix(source.entries, target.entries);
  for (const entry of source.entries.slice(target.head.sequence)) {
    await append({ db: input.targetDb, anchorDb: input.targetAnchorDb,
      streamId: input.streamId, entry, expectedSequence: target.head.sequence,
      expectedHeadHash: target.head.headHash, trustRegistry: input.trustRegistry,
      now: input.now });
    target = await localState(input.targetDb, input.streamId);
  }
  return inspect({ db: input.targetDb, anchorDb: input.targetAnchorDb,
    streamId: input.streamId, trustRegistry: input.trustRegistry, now: input.now });
}

function assertReplicationPrefix(source, target) {
  if (target.length > source.length) throw failure('FOUNDATION_REVOCATION_DIVERGENCE');
  const divergent = target.some((entry, index) => entry.entryHash !== source[index]?.entryHash);
  if (divergent) throw failure('FOUNDATION_REVOCATION_DIVERGENCE');
}

module.exports = { ensureSchema, appendLocal, anchorHead, append, inspect,
  recoverAnchor, replicate };
