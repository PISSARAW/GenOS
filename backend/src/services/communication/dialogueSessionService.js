'use strict';

const { analyzeSpeechAct } = require('../philosophy/speechActService');
const { createLanguageGame, evaluateMove } = require('../philosophy/languageGameService');
const { ensureVerbalTables, assertArtifactKind, getEscalation } = require('./verbalEscalationService');

const DIALOGUE_DIRECT = new Set(['COMMITMENT_NEGOTIATION', 'HUMAN_EXPLANATION_REQUIRED']);

const DEFAULT_BUDGETS = Object.freeze({ tokenBudget: 2000, maxTurns: 8 });

function budgetsOf(input) {
  return {
    tokenBudget: Number(input.tokenBudget || DEFAULT_BUDGETS.tokenBudget),
    maxTurns: Number(input.maxTurns || DEFAULT_BUDGETS.maxTurns)
  };
}

function deadlineOf(input) {
  if (input.deadlineMs) return new Date(Date.now() + Number(input.deadlineMs)).toISOString();
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

async function forceCloseUnresolved(db, escalationId, tokensUsed) {
  await db.run(
    `INSERT OR IGNORE INTO dialogue_artifacts (escalation_id, kind, artifact_json) VALUES (?, 'UNRESOLVED', ?)`,
    [escalationId, JSON.stringify({ reason: 'budget_exhausted', tokensUsed })]
  );
  await db.run("UPDATE verbal_escalations SET status = 'unresolved', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [escalationId]);
  return getSession({ db, escalationId });
}

async function appendTurn(input) {
  const db = await ensureVerbalTables(input.db);
  const session = await getSession({ db, escalationId: input.escalationId });
  if (!session || session.status !== 'dialogue_open') {
    throw new Error('Dialogue is not open for new turns.');
  }
  const used = Number(session.tokensUsed) + Number(input.tokensUsed || 0);
  if (used > Number(session.tokenBudget)) return forceCloseUnresolved(db, session.id, used);
  const count = await turnCount(db, session.id);
  if (count >= Number(session.maxTurns)) return forceCloseUnresolved(db, session.id, used);
  const speechAct = analyzeSpeechAct({ utterance: input.utterance, speaker: input.speaker });
  await db.run(
    `INSERT INTO dialogue_turns (escalation_id, seq, speaker_agent_id, utterance_text, speech_act_json, tokens_used)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [session.id, count + 1, input.speaker, input.utterance, JSON.stringify(speechAct), Number(input.tokensUsed || 0)]
  );
  await db.run('UPDATE verbal_escalations SET tokens_used = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [used, session.id]);
  return { turn: count + 1, speechAct, closed: false, tokensUsed: used };
}

async function closeSession(input) {
  const db = await ensureVerbalTables(input.db);
  const session = await getSession({ db, escalationId: input.escalationId });
  if (!session || session.status !== 'dialogue_open') {
    throw new Error('Only an open dialogue can be closed with an artifact.');
  }
  assertArtifactKind(input.artifactKind);
  await db.run(
    `INSERT INTO dialogue_artifacts (escalation_id, kind, artifact_json) VALUES (?, ?, ?)`,
    [session.id, input.artifactKind, JSON.stringify(input.artifact || {})]
  );
  const status = input.artifactKind === 'UNRESOLVED' ? 'unresolved' : 'resolved';
  await db.run('UPDATE verbal_escalations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, session.id]);
  return getSession({ db, escalationId: session.id });
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
