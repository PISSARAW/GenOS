'use strict';

const crypto = require('crypto');
const { getDatabase } = require('../../db');
const { VERBAL_TRIGGERS } = require('./selectiveEncodingService');

const ARTIFACT_KINDS = new Set([
  'OntologyPatch', 'ContractPatch', 'AssumptionSet', 'Commitment', 'FormalResult',
  'ExperimentProposal', 'NewSignalDefinition', 'NewReceptorDefinition', 'QuestionForHuman', 'UNRESOLVED'
]);

const ESCALATION_STATUSES = new Set([
  'micro_pending', 'micro_exhausted', 'dialogue_open', 'resolved', 'unresolved'
]);

function assertArtifactKind(kind) {
  if (!ARTIFACT_KINDS.has(kind)) throw new Error(`Dialogue must close with a structured artifact or UNRESOLVED, not '${kind}'.`);
}

async function resolveDb(inputDb) {
  if (inputDb) return inputDb;
  return getDatabase();
}

async function ensureVerbalTables(inputDb) {
  const db = await resolveDb(inputDb);
  await db.exec(`CREATE TABLE IF NOT EXISTS verbal_escalations (
    id TEXT PRIMARY KEY, trigger TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'micro_pending',
    participants_json TEXT NOT NULL DEFAULT '[]', unresolved_question TEXT NOT NULL,
    domain TEXT, token_budget INTEGER NOT NULL DEFAULT 200, tokens_used INTEGER NOT NULL DEFAULT 0,
    max_turns INTEGER NOT NULL DEFAULT 8, deadline_at DATETIME, required_artifact TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('micro_pending', 'micro_exhausted', 'dialogue_open', 'resolved', 'unresolved')),
    CHECK (json_valid(participants_json))
  );
  CREATE TABLE IF NOT EXISTS dialogue_turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT, escalation_id TEXT NOT NULL, seq INTEGER NOT NULL,
    speaker_agent_id TEXT NOT NULL, utterance_text TEXT NOT NULL,
    speech_act_json TEXT NOT NULL DEFAULT '{}', tokens_used INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (escalation_id, seq)
  );
  CREATE INDEX IF NOT EXISTS idx_dialogue_turns_esc ON dialogue_turns(escalation_id, seq);
  CREATE TABLE IF NOT EXISTS dialogue_artifacts (
    escalation_id TEXT PRIMARY KEY, kind TEXT NOT NULL,
    artifact_json TEXT NOT NULL DEFAULT '{}', created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(artifact_json))
  );`);
  return db;
}

function assertEscalationArgs(input) {
  if (!VERBAL_TRIGGERS.has(input.trigger)) {
    throw new Error(`Verbal escalation requires an explicit trigger, not '${input.trigger}'.`);
  }
  if (!Array.isArray(input.participants) || input.participants.length < 2) {
    throw new Error('Verbal escalation requires at least two participants.');
  }
  if (!String(input.unresolvedQuestion || '').trim()) {
    throw new Error('Verbal escalation requires an unresolved question.');
  }
}

async function requestEscalation(input) {
  assertEscalationArgs(input);
  const db = await ensureVerbalTables(input.db);
  const id = `vesc_${crypto.randomUUID()}`;
  await db.run(
    `INSERT INTO verbal_escalations (id, trigger, status, participants_json, unresolved_question, domain)
     VALUES (?, ?, 'micro_pending', ?, ?, ?)`,
    [id, input.trigger, JSON.stringify(input.participants), input.unresolvedQuestion, input.domain || null]
  );
  return getEscalation({ db, escalationId: id });
}

async function loadEscalation(db, escalationId) {
  const row = await db.get('SELECT * FROM verbal_escalations WHERE id = ?', [escalationId]);
  if (!row) throw new Error(`Unknown verbal escalation '${escalationId}'.`);
  return deserializeEscalation(row);
}

function deserializeEscalation(row) {
  return {
    id: row.id, trigger: row.trigger, status: row.status,
    participants: JSON.parse(row.participants_json || '[]'),
    unresolvedQuestion: row.unresolved_question, domain: row.domain || null,
    tokenBudget: Number(row.token_budget), tokensUsed: Number(row.tokens_used),
    maxTurns: Number(row.max_turns), deadlineAt: row.deadline_at || null,
    requiredArtifact: row.required_artifact || null,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

async function getEscalation(input) {
  const db = await ensureVerbalTables(input.db);
  const row = await db.get('SELECT * FROM verbal_escalations WHERE id = ?', [input.escalationId]);
  if (!row) return null;
  return deserializeEscalation(row);
}

async function markMicroExhausted(input) {
  const db = await ensureVerbalTables(input.db);
  const escalation = await loadEscalation(db, input.escalationId);
  if (escalation.status !== 'micro_pending') {
    throw new Error(`Micro-utterance already settled (status '${escalation.status}').`);
  }
  if (input.outcome !== 'failed' && input.outcome !== 'resolved') {
    throw new Error("Micro outcome must be 'failed' or 'resolved'.");
  }
  if (input.outcome === 'resolved') {
    assertArtifactKind(input.artifactKind);
    await db.run(
      `INSERT INTO dialogue_artifacts (escalation_id, kind, artifact_json) VALUES (?, ?, ?)`,
      [escalation.id, input.artifactKind, JSON.stringify(input.artifact || {})]
    );
    await db.run("UPDATE verbal_escalations SET status = 'resolved', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [escalation.id]);
    return getEscalation({ db, escalationId: escalation.id });
  }
  await db.run("UPDATE verbal_escalations SET status = 'micro_exhausted', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [escalation.id]);
  return getEscalation({ db, escalationId: escalation.id });
}

module.exports = {
  ARTIFACT_KINDS,
  ESCALATION_STATUSES,
  assertArtifactKind,
  ensureVerbalTables,
  requestEscalation,
  getEscalation,
  markMicroExhausted
};
