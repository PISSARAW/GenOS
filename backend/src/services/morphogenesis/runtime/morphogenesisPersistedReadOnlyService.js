'use strict';

const crypto = require('node:crypto');
const { compileFlatTopology } = require('../graph/compileFlatTopology');
const { createMorphologyGraphStore } = require('../graph/morphologyGraphStore');
const { adjudicatePostMission } = require('./morphogenesisRustReadOnlyBridge');

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function unavailable(reason) {
  return { available: false, decision: 'UNAVAILABLE', committed: false, reason };
}

async function persistPreparedMorphology(input) {
  const { db, missionId, morphology } = input;
  if (!db || !missionId || !morphology?.topology) throw new Error('Mission, database and prepared morphology are required');
  const graph = compileFlatTopology({ selectedTopology: morphology.topology,
    variant: morphology.variantId || null, missionId, status: 'proposed' });
  const root = graph.nodes.find((node) => node.nodeId === graph.rootNodeId);
  if (!root) throw new Error('Prepared morphology has no graph root');
  root.workers = (morphology.agents || []).map((agent) => ({ ...agent }));
  const saved = await createMorphologyGraphStore({ db }).save(graph);
  const row = await db.get(`SELECT graph_json AS graphJson FROM morphology_graph_versions
    WHERE graph_id = ? AND version = ? AND mission_id = ?`, saved.graphId, saved.version, missionId);
  if (!row) throw new Error('Prepared morphology graph snapshot was not persisted');
  return { missionId, graphId: saved.graphId, graphVersion: saved.version,
    snapshotSha256: digest(row.graphJson), topology: morphology.topology,
    variantId: morphology.variantId || null };
}

async function readBoundSnapshot(db, ref, morphology) {
  if (!ref?.missionId || !ref.graphId || !ref.graphVersion || !ref.snapshotSha256) return null;
  const row = await db.get(`SELECT graph_json AS graphJson FROM morphology_graph_versions
    WHERE graph_id = ? AND version = ? AND mission_id = ?`, ref.graphId, ref.graphVersion, ref.missionId);
  if (!row || digest(row.graphJson) !== ref.snapshotSha256) return null;
  const latest = await db.get('SELECT MAX(version) AS version FROM morphology_graph_versions WHERE graph_id = ?', ref.graphId);
  if (latest?.version !== ref.graphVersion) return null;
  const graph = JSON.parse(row.graphJson);
  return snapshotMatchesMorphology(graph, morphology) ? graph : null;
}

function snapshotMatchesMorphology(graph, morphology) {
  const root = graph.nodes?.find((node) => node.nodeId === graph.rootNodeId);
  return graph.status === 'proposed' && root?.topology === morphology.topology
    && (root.variant || null) === (morphology.variantId || null);
}

async function ensureProposalTable(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS morphogenesis_read_only_proposals (
    id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, graph_id TEXT NOT NULL,
    graph_version INTEGER NOT NULL, snapshot_sha256 TEXT NOT NULL,
    outcome_verdict TEXT NOT NULL, proposals_json TEXT NOT NULL,
    proposal_sha256 TEXT NOT NULL, created_at TEXT NOT NULL
  )`);
}

function proposalDigest(row) {
  return digest(JSON.stringify({ id: row.id, missionId: row.mission_id,
    graphId: row.graph_id, graphVersion: row.graph_version,
    snapshotSha256: row.snapshot_sha256, outcomeVerdict: row.outcome_verdict,
    proposalsJson: row.proposals_json }));
}

function proposalSignal(outcome) {
  return outcome?.verdict === 'unverified' ? 'evidence_gap' : 'none';
}

function verifyProposals(response, payload) {
  if (response?.schemaVersion !== 1 || response.requestSha256 !== digest(payload)
    || response.committed !== false || !Array.isArray(response.proposals)
    || response.proposals.length > 64) throw new Error('Invalid Rust resolver proposal response');
  return response.proposals;
}

async function resolveAndPersist(input) {
  const { db, ref, outcome, runner } = input;
  const payload = JSON.stringify({ schemaVersion: 1, missionId: ref.missionId,
    snapshotSha256: ref.snapshotSha256, signal: proposalSignal(outcome) });
  const run = runner || require('../../genosCli').runGenos;
  const result = await run(['morphogenesis-propose', payload], { timeoutMs: 10000 });
  if (!result?.ok) return { error: result?.code || 'RUST_RESOLVER_UNAVAILABLE' };
  const proposals = verifyProposals(result.json, payload);
  await ensureProposalTable(db);
  const id = crypto.randomUUID();
  const row = { id, mission_id: ref.missionId, graph_id: ref.graphId,
    graph_version: ref.graphVersion, snapshot_sha256: ref.snapshotSha256,
    outcome_verdict: outcome?.verdict || 'unknown', proposals_json: JSON.stringify(proposals) };
  await db.run(`INSERT INTO morphogenesis_read_only_proposals
    (id, mission_id, graph_id, graph_version, snapshot_sha256, outcome_verdict,
      proposals_json, proposal_sha256, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, row.mission_id, row.graph_id,
  row.graph_version, row.snapshot_sha256, row.outcome_verdict,
  row.proposals_json, proposalDigest(row), new Date().toISOString());
  return { id };
}

async function readPersistedProposals(db, ref, id) {
  const row = await db.get(`SELECT * FROM morphogenesis_read_only_proposals
    WHERE id = ? AND mission_id = ? AND graph_id = ? AND graph_version = ? AND snapshot_sha256 = ?`,
  id, ref.missionId, ref.graphId, ref.graphVersion, ref.snapshotSha256);
  if (!row || row.proposal_sha256 !== proposalDigest(row)) return null;
  try {
    const proposals = JSON.parse(row.proposals_json);
    return Array.isArray(proposals) ? { proposals, id: row.id, outcomeVerdict: row.outcome_verdict } : null;
  } catch (_) {
    return null;
  }
}

async function readStableRecord(input) {
  const { db, ref, morphology, id } = input;
  const record = await readPersistedProposals(db, ref, id);
  if (!record || !await readBoundSnapshot(db, ref, morphology)) return null;
  return record;
}

function sameRecord(left, right) {
  return Boolean(left && right && left.outcomeVerdict === right.outcomeVerdict
    && JSON.stringify(left.proposals) === JSON.stringify(right.proposals));
}

async function adjudicatePersistedOutcome(input) {
  const { db, missionId, morphology, snapshotRef, outcome } = input;
  if (!db || !snapshotRef || snapshotRef.missionId !== missionId) return unavailable('SNAPSHOT_MISSING_OR_MISSION_MISMATCH');
  const graph = await readBoundSnapshot(db, snapshotRef, morphology);
  if (!graph) return unavailable('SNAPSHOT_STALE_OR_MISMATCHED');
  let persisted;
  try {
    persisted = await resolveAndPersist({ db, ref: snapshotRef, outcome, runner: input.runner });
  } catch (error) {
    return unavailable(error.code || 'RUST_RESOLVER_FAILED');
  }
  if (persisted.error) return unavailable(persisted.error);
  const record = await readStableRecord({ db, ref: snapshotRef, morphology, id: persisted.id });
  if (!record) return unavailable('PROPOSAL_OR_SNAPSHOT_STALE');
  const decision = await adjudicatePostMission(morphology, { missionId,
    record: { ...record, snapshotRef }, runner: input.runner });
  const current = await readStableRecord({ db, ref: snapshotRef, morphology, id: persisted.id });
  if (!sameRecord(current, record)) {
    return unavailable('PROPOSAL_OR_SNAPSHOT_CHANGED_DURING_ADJUDICATION');
  }
  return { ...decision, proposalRecordId: record.id, snapshotRef,
    proposalCount: record.proposals.length };
}

module.exports = { persistPreparedMorphology, adjudicatePersistedOutcome,
  readBoundSnapshot, readPersistedProposals };
