'use strict';

const { open } = require('../../backend/node_modules/sqlite');
const sqlite3 = require('../../backend/node_modules/sqlite3');
const memory = require('../../backend/src/services/ontogenesis/memoryService');
const abstention = require('../../backend/src/services/abstentionService');
const { operators, hash } = require('./corpus.cjs');
const protocol = require('./protocol.json');

const INSTRUCTION = [
  'Solve an integer expression in a new language. Each operator is a fixed affine map a*x+b.',
  'Operator names carry no information about coefficients. Only verified examples provide evidence.',
  'Nested expressions apply the inner operator first. Do not invent missing operator definitions.',
  'Return JSON with answer (number or null), confidence (0..1 probability your numeric answer is correct),',
  'abstain (boolean), missing (array of operator names whose definition you cannot infer).',
  'If information is insufficient, use answer=null, low confidence, abstain=true and identify missing operators.'
].join(' ');

async function connect(filename) {
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec(`CREATE TABLE IF NOT EXISTS ontogenesis_memory (
    id TEXT PRIMARY KEY, project_id TEXT, kind TEXT, content TEXT, provenance_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
  return db;
}

async function learn(db, input) {
  const example = { expression: input.task.expression, answer: input.expected };
  await memory.recordMemory(db, { id: input.task.id, projectId: 'competence-100', kind: 'constraint',
    content: JSON.stringify(example), provenance: { phase: 'training', oracleEvent: input.oracleEvent } });
}

async function recall(db, expression) {
  const wanted = new Set(operators(expression));
  const counts = {};
  const rows = await memory.listMemories(db, 'competence-100', 'constraint');
  return rows.map(row => JSON.parse(row.content)).filter(example => {
    const op = example.expression.op;
    if (!wanted.has(op)) return false;
    counts[op] = (counts[op] || 0) + 1;
    return counts[op] <= protocol.memoryExamplesPerOperator;
  });
}

function prompt(task, examples) {
  return JSON.stringify({ verifiedTrainingExamples: examples, expression: task.expression });
}

function validResponse(value) {
  if (!value || typeof value !== 'object') return false;
  return validAnswer(value.answer) && validProbability(value.confidence) && typeof value.abstain === 'boolean'
    && Array.isArray(value.missing) && value.missing.every(item => typeof item === 'string');
}

function validAnswer(value) {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function validProbability(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function decision(response) {
  const policy = abstention.evaluateAbstention({ confidence: response.confidence,
    uncertainty: 1 - response.confidence, integrity: 1 });
  return { ...policy, abstain: response.abstain || policy.abstain };
}

async function stateHash(db) {
  return hash(await memory.listMemories(db, 'competence-100', 'constraint'));
}

module.exports = { connect, learn, recall, prompt, validResponse, decision, stateHash, INSTRUCTION };
