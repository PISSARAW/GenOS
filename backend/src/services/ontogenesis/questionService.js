'use strict';

const crypto = require('crypto');
const { postEvent } = require('./inboxService');

/**
 * Clarification structurée (roadmap §P3).
 * Question typée (choice/confirm/info), choix proposés, réponse
 * par défaut appliquée à l'échéance, réponse = événement user_reply
 * qui réveille WAITING_INPUT.
 */

const KINDS = ['choice', 'confirm', 'info'];

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function parseOptions(row) {
  try {
    const value = JSON.parse(row.options_json || '[]');
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function checkAskable(input) {
  if (!KINDS.includes(input.kind)) throw new Error('question-kind-inconnu');
  if (input.kind === 'choice' && (!Array.isArray(input.options) || input.options.length === 0)) {
    throw new Error('choix-requis');
  }
}

async function askQuestion(db, input) {
  checkAskable(input);
  const id = input.id || newId('q');
  await db.run(
    `INSERT INTO ontogenesis_questions
       (id, project_id, task_id, kind, question, options_json, default_choice, deadline_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.projectId, input.taskId || null, input.kind, input.question || '',
      JSON.stringify(input.options || []), input.defaultChoice || null, input.deadlineAt || null]
  );
  return id;
}

async function getQuestion(db, questionId) {
  return db.get('SELECT * FROM ontogenesis_questions WHERE id = ?', [questionId]);
}

async function openQuestions(db, projectId) {
  return db.all(
    `SELECT * FROM ontogenesis_questions WHERE project_id = ? AND status = 'open' ORDER BY created_at ASC`,
    [projectId]
  );
}

async function answerQuestion(db, input) {
  const row = await getQuestion(db, input.id);
  if (!row) throw new Error('question-introuvable');
  if (row.status !== 'open') throw new Error(`question-${row.status}`);
  if (row.kind === 'choice' && !parseOptions(row).includes(input.answer)) {
    throw new Error('reponse-hors-choix');
  }
  await db.run(`UPDATE ontogenesis_questions SET status = 'answered', answer = ? WHERE id = ?`, [input.answer, row.id]);
  await postEvent(db, { projectId: row.project_id, type: 'user_reply', payload: { questionId: row.id } });
  return { id: row.id, status: 'answered', answer: input.answer };
}

async function expireDue(db, input) {
  const now = (input && input.nowIso) || new Date().toISOString();
  const rows = await db.all(
    `SELECT * FROM ontogenesis_questions
     WHERE project_id = ? AND status = 'open' AND deadline_at IS NOT NULL AND deadline_at <= ?`,
    [input.projectId, now]
  );
  for (const row of rows) {
    await db.run(`UPDATE ontogenesis_questions SET status = 'expired' WHERE id = ?`, [row.id]);
  }
  return rows.map((row) => row.id);
}

function resolutionOf(question) {
  if (!question) return null;
  if (question.status === 'answered') return question.answer;
  if (question.status === 'expired') return question.default_choice || null;
  return null;
}

module.exports = { KINDS, askQuestion, getQuestion, openQuestions, answerQuestion, expireDue, resolutionOf };
