'use strict';

const { analyzeSpeechAct } = require('../philosophy/speechActService');
const { createLanguageGame, evaluateMove } = require('../philosophy/languageGameService');
const { compileFromReport } = require('./speechActCompilerService');
const { ensureVerbalTables, assertArtifactKind, getEscalation } = require('./verbalEscalationService');
const { withTransaction } = require('../../db');

const DIALOGUE_DIRECT = new Set(['COMMITMENT_NEGOTIATION', 'HUMAN_EXPLANATION_REQUIRED']);

const DEFAULT_BUDGETS = Object.freeze({ tokenBudget: 2000, maxTurns: 8 });

function budgetsOf(input) {
  const tokenBudget = input.tokenBudget === undefined ? DEFAULT_BUDGETS.tokenBudget : Number(input.tokenBudget);
  const maxTurns = input.maxTurns === undefined ? DEFAULT_BUDGETS.maxTurns : Number(input.maxTurns);
  if (!Number.isSafeInteger(tokenBudget) || tokenBudget < 0 || tokenBudget > 1000000) {
    throw new Error('Dialogue tokenBudget must be an integer between 0 and 1000000.');
  }
  if (!Number.isSafeInteger(maxTurns) || maxTurns < 1 || maxTurns > 100) {
    throw new Error('Dialogue maxTurns must be an integer between 1 and 100.');
  }
  return { tokenBudget, maxTurns };
}

function deadlineOf(input) {
  if (input.deadlineMs !== undefined && input.deadlineMs !== null) {
    const deadlineMs = Number(input.deadlineMs);
    if (!Number.isFinite(deadlineMs) || deadlineMs <= 0 || deadlineMs > 86400000) {
      throw new Error('Dialogue deadlineMs must be between 1 and 86400000.');
    }
    return new Date(Date.now() + deadlineMs).toISOString();
  }
  return null;
}

async function openDialogue(input) {
  const db = await ensureVerbalTables(input.db);
  const escalation = await getEscalation({ db, escalationId: input.escalationId });
  if (!escalation) throw new Error(`Unknown verbal escalation '${input.escalationId}'.`);
  if (escalation.status === 'dialogue_open') return getSession({ db, escalationId: escalation.id });
  const bypass = DIALOGUE_DIRECT.has(escalation.trigger);
  if (escalation.status !== 'micro_exhausted' && !(escalation.status === 'micro_pending' && bypass)) {
    throw new Error('MICRO_FIRST: try MICRO_UTTERANCE before bounded DIALOGUE.');
  }
  if (input.requiredArtifact) assertArtifactKind(input.requiredArtifact);
  const budgets = budgetsOf(input);
  await db.run(
    `UPDATE verbal_escalations SET status = 'dialogue_open', token_budget = ?, max_turns = ?,
       deadline_at = ?, required_artifact = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [budgets.tokenBudget, budgets.maxTurns, deadlineOf(input), input.requiredArtifact || null, escalation.id]
  );
  return getSession({ db, escalationId: escalation.id });
}

async function turnCount(db, escalationId) {
  const row = await db.get('SELECT COUNT(*) AS n FROM dialogue_turns WHERE escalation_id = ?', [escalationId]);
  return Number(row.n);
}

async function forceCloseUnresolved(db, escalationId, { tokensUsed, reason } = {}) {
  await db.run(
    `INSERT OR IGNORE INTO dialogue_artifacts (escalation_id, kind, artifact_json) VALUES (?, 'UNRESOLVED', ?)`,
    [escalationId, JSON.stringify({ reason, tokensUsed })]
  );
  await db.run("UPDATE verbal_escalations SET status = 'unresolved', tokens_used = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [tokensUsed, escalationId]);
  return getSession({ db, escalationId });
}

async function appendTurn(input) {
  const db = await ensureVerbalTables(input.db);
  const turnTokens = validateDialogueInput(input);
  return withTransaction(db, async (tx) => {
    const session = await getSession({ db: tx, escalationId: input.escalationId });
    if (!session || session.status !== 'dialogue_open') {
      throw new Error('Dialogue is not open for new turns.');
    }
    if (!session.participants.includes(input.speaker)) throw new Error('Speaker is not a participant in this dialogue.');
    const used = Number(session.tokensUsed) + turnTokens;
    if (session.deadlineAt && Date.now() >= Date.parse(session.deadlineAt)) {
      return forceCloseUnresolved(tx, session.id, { tokensUsed: used, reason: 'deadline_exhausted' });
    }
    if (used > Number(session.tokenBudget)) return forceCloseUnresolved(tx, session.id, { tokensUsed: used, reason: 'budget_exhausted' });
    const count = await turnCount(tx, session.id);
    if (count >= Number(session.maxTurns)) return forceCloseUnresolved(tx, session.id, { tokensUsed: used, reason: 'turn_limit_exhausted' });
    const speechAct = analyzeSpeechAct({ utterance: input.utterance, speaker: input.speaker });
    const compiled = compileFromReport(speechAct, { utterance: input.utterance, speaker: input.speaker });
    const stored = Object.assign({}, speechAct, { compiled });
    await tx.run(
      `INSERT INTO dialogue_turns (escalation_id, seq, speaker_agent_id, utterance_text, speech_act_json, tokens_used)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [session.id, count + 1, input.speaker, input.utterance, JSON.stringify(stored), turnTokens]
    );
    await tx.run('UPDATE verbal_escalations SET tokens_used = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [used, session.id]);
    return { turn: count + 1, speechAct, compiled, closed: false, tokensUsed: used };
  });
}

async function closeSession(input) {
  const db = await ensureVerbalTables(input.db);
  assertArtifactKind(input.artifactKind);
  return withTransaction(db, async (tx) => {
    const session = await getSession({ db: tx, escalationId: input.escalationId });
    if (!session || session.status !== 'dialogue_open') {
      throw new Error('Only an open dialogue can be closed with an artifact.');
    }
    if (session.requiredArtifact && input.artifactKind !== 'UNRESOLVED'
        && input.artifactKind !== session.requiredArtifact) {
      throw Object.assign(new Error(`Dialogue requires artifact '${session.requiredArtifact}', not '${input.artifactKind}'.`), {
        code: 'REQUIRED_ARTIFACT_MISMATCH'
      });
    }
    await tx.run(
      `INSERT INTO dialogue_artifacts (escalation_id, kind, artifact_json) VALUES (?, ?, ?)`,
      [session.id, input.artifactKind, JSON.stringify(input.artifact || {})]
    );
    const status = input.artifactKind === 'UNRESOLVED' ? 'unresolved' : 'resolved';
    await tx.run('UPDATE verbal_escalations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, session.id]);
    return getSession({ db: tx, escalationId: session.id });
  });
}

async function getSession(input) {
  const db = await ensureVerbalTables(input.db);
  const row = await db.get('SELECT * FROM verbal_escalations WHERE id = ?', [input.escalationId]);
  if (!row) return null;
  const turns = await db.all('SELECT * FROM dialogue_turns WHERE escalation_id = ? ORDER BY seq ASC', [input.escalationId]);
  const artifact = await db.get('SELECT * FROM dialogue_artifacts WHERE escalation_id = ?', [input.escalationId]);
  return {
    id: row.id, trigger: row.trigger, status: row.status,
    participants: JSON.parse(row.participants_json || '[]'),
    unresolvedQuestion: row.unresolved_question, domain: row.domain || null,
    tokenBudget: Number(row.token_budget), tokensUsed: Number(row.tokens_used),
    maxTurns: Number(row.max_turns), deadlineAt: row.deadline_at || null,
    requiredArtifact: row.required_artifact || null,
    turns: turns.map(deserializeTurn),
    artifact: artifact ? { kind: artifact.kind, content: JSON.parse(artifact.artifact_json || '{}') } : null
  };
}

function deserializeTurn(row) {
  return {
    seq: Number(row.seq), speaker: row.speaker_agent_id, utterance: row.utterance_text,
    speechAct: JSON.parse(row.speech_act_json || '{}'), tokensUsed: Number(row.tokens_used)
  };
}

function defaultConventionGame() {
  return createLanguageGame({
    name: 'dialogue-conventions',
    community: 'participating agents',
    rules: [
      { id: 'force-question', kind: 'constitutive', description: 'clarification moves use question force' },
      { id: 'force-commissive', kind: 'constitutive', description: 'commitment moves use commissive force' },
      { id: 'force-assertive', kind: 'regulative', description: 'evidence moves use assertive force' },
      { id: 'force-directive', kind: 'regulative', description: 'delegation moves use directive force' }
    ]
  });
}

async function validateConventions(input) {
  const session = await getSession(input);
  if (!session) throw new Error(`Unknown dialogue '${input.escalationId}'.`);
  const game = input.game || defaultConventionGame();
  const assessments = [];
  for (const turn of session.turns) {
    const force = turn.speechAct && turn.speechAct.illocution ? turn.speechAct.illocution.force : 'assertive';
    assessments.push(evaluateMove({ game, move: { ruleId: `force-${force}`, action: turn.seq }, participantRole: turn.speaker }));
  }
  return { escalationId: session.id, assessments };
}

module.exports = {
  DIALOGUE_DIRECT,
  openDialogue,
  appendTurn,
  closeSession,
  getSession,
  validateConventions
};

function validateDialogueInput(input) {
const turnTokens = input.tokensUsed === undefined ? 0 : Number(input.tokensUsed);
  if (!Number.isSafeInteger(turnTokens) || turnTokens < 0) throw new Error('tokensUsed must be a non-negative integer.');
  if (typeof input.utterance !== 'string' || !input.utterance.trim()) throw new Error('A non-empty utterance is required.');
return turnTokens;
}
