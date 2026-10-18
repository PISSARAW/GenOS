'use strict';

const crypto = require('node:crypto');
const roots = require('./roots');

function describeCandidate(row) {
  return {
    workerId: row.worker_id,
    workspaceId: row.workspace_id,
    viewId: row.view_id,
    baseHash: row.base_hash,
    candidateHash: row.candidate_hash,
    backend: row.backend || 'physical',
    status: row.status,
    outcome: row.outcome || null
  };
}

async function candidatesForWorkers(db, input) {
  const workerIds = [...new Set(input.workerIds || [])];
  if (!workerIds.length) return [];
  const placeholders = workerIds.map(() => '?').join(', ');
  const rows = await db.all(`SELECT * FROM gqwf_worker_bindings
    WHERE workspace_id = ? AND worker_id IN (${placeholders}) AND candidate_hash IS NOT NULL
      AND (status = 'captured' OR (status = 'released' AND outcome = 'completed'))
    ORDER BY worker_id`, input.workspaceId, ...workerIds);
  return rows.map(describeCandidate);
}

async function candidate(db, input) {
  const row = await db.get(`SELECT * FROM gqwf_worker_bindings
    WHERE worker_id = ? AND workspace_id = ?`, input.workerId, input.workspaceId);
  const promotable = row?.candidate_hash && (row.status === 'captured'
    || (row.status === 'released' && row.outcome === 'completed'));
  if (!promotable) throw new Error('GQWF worker candidate is not promotable.');
  if (row.base_hash !== input.expectedHash) {
    throw new Error('GQWF worker candidate base differs from the expected head.');
  }
  return row;
}

function assertWorkerVerdict(context, verdict) {
  const { input, row } = context;
  const received = Object(verdict);
  const bindings = [received.success === true, received.evidenceId === input.evidenceId,
    received.workerId === row.worker_id, received.viewId === row.view_id,
    received.workspaceId === row.workspace_id, received.headName === input.name,
    received.baseHash === row.base_hash, received.previousHash === input.expectedHash,
    received.generation === input.expectedGeneration, received.candidateHash === row.candidate_hash,
    typeof received.evidenceId === 'string', Boolean(received.evidenceId?.trim())];
  if (!bindings.every(Boolean)) {
    throw new Error('GQWF worker promotion lacks evidence bound to this candidate and head.');
  }
}

async function existingReceipt(db, input, candidateHash) {
  return db.get(`SELECT * FROM gqwf_worker_promotions WHERE worker_id = ? AND workspace_id = ?
    AND head_name = ? AND candidate_hash = ? AND evidence_id = ?`, input.workerId,
  input.workspaceId, input.name, candidateHash, input.evidenceId);
}

function describeReceipt(row) {
  return {
    promotionId: row.id,
    workerId: row.worker_id,
    workspaceId: row.workspace_id,
    viewId: row.view_id,
    headName: row.head_name,
    previousHash: row.previous_hash,
    candidateHash: row.candidate_hash,
    generation: row.published_generation,
    evidenceId: row.evidence_id
  };
}

async function persistReceipt(tx, context) {
  const { input, row, published } = context;
  const id = `gqwf_worker_promotion_${crypto.randomUUID()}`;
  await tx.run(`INSERT INTO gqwf_worker_promotions
    (id, worker_id, workspace_id, view_id, head_name, previous_hash, candidate_hash,
      expected_generation, published_generation, evidence_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, row.worker_id, row.workspace_id,
  row.view_id, input.name, input.expectedHash, row.candidate_hash,
  input.expectedGeneration, published.generation, input.evidenceId);
}

async function promoteWorkerCandidate(db, input, verifier) {
  if (typeof verifier !== 'function') throw new Error('GQWF worker promotion verifier is unavailable.');
  if (typeof input.evidenceId !== 'string' || !input.evidenceId.trim()) {
    throw new Error('GQWF worker promotion requires a durable evidence ID.');
  }
  const row = await candidate(db, input);
  const prior = await existingReceipt(db, input, row.candidate_hash);
  if (prior) return describeReceipt(prior);
  const request = { ...input, viewId: row.view_id, baseHash: row.base_hash,
    candidateHash: row.candidate_hash };
  const verdict = await verifier(request);
  assertWorkerVerdict({ input, row }, verdict);
  const publication = {
    workspaceId: input.workspaceId,
    name: input.name,
    expectedHash: input.expectedHash,
    expectedGeneration: input.expectedGeneration,
    candidateHash: row.candidate_hash
  };
  const published = await roots.publishCandidate(db, publication, {
    verifier: async () => verdict,
    persistReceipt: (tx, result) => persistReceipt(tx, { input, row, published: result })
  });
  const receipt = await existingReceipt(db, input, row.candidate_hash);
  if (!receipt || receipt.published_generation !== published.generation) {
    throw new Error('GQWF worker promotion receipt was not persisted.');
  }
  return describeReceipt(receipt);
}

module.exports = { candidatesForWorkers, promoteWorkerCandidate };
