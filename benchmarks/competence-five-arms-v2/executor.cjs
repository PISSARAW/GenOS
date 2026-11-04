'use strict';

const corpus = require('../competence-five-arms/corpus.cjs');
const contracts = require('./contracts.cjs');
const abstention = require('../../backend/src/services/abstentionService');

function refuse(reason, missing, source) {
  return { answer: null, confidence: 0, abstain: true, reason, missing, source, valid: true };
}

function evidenceFor(payload) {
  const rows = corpus.relevant(payload.observations, payload.query);
  return [...new Set(corpus.operators(payload.query.expression))].map(op => ({ op,
    epoch: payload.query.epochs[op] || 0, samples: rows.filter(row => row.op === op),
    provided: payload.providedRules.find(rule => rule.op === op && rule.epoch === (payload.query.epochs[op] || 0)) }));
}

function coverage(evidence) {
  const missing = evidence.filter(item => !item.provided && item.samples.length === 0).map(item => item.op);
  if (missing.length) return refuse('missing', missing, 'coverage_gate');
  const sparse = evidence.some(item => !item.provided && new Set(item.samples.map(row => row.x)).size < 3);
  return sparse ? refuse('ambiguous', [], 'minimum_evidence_gate') : null;
}

function matches(program, evidence) {
  if (!program || !contracts.programValid(program) || program.epoch !== evidence.epoch) return false;
  if (evidence.provided) {
    return ['kind', 'a', 'b', 'c'].every(key => program[key] === evidence.provided[key]);
  }
  return evidence.samples.every(row => corpus.value(program, row.x) === row.y);
}

function programsFor(value, evidence) {
  if (value.programs.length !== evidence.length) return null;
  const map = Object.fromEntries(value.programs.map(program => [program.op, program]));
  if (Object.keys(map).length !== evidence.length) return null;
  return evidence.every(item => matches(map[item.op], item)) ? map : null;
}

function evaluate(expression, programs, depth = 0) {
  if (depth > 16) throw Error('Program depth budget exceeded');
  if (typeof expression === 'number') return expression;
  const inside = evaluate(expression.value, programs, depth + 1);
  const result = corpus.value(programs[expression.op], inside);
  if (!Number.isSafeInteger(result) || Math.abs(result) > 1e12) throw Error('Program arithmetic budget exceeded');
  return result;
}

function execute(payload, model) {
  if (!model.valid) return { ...refuse('ambiguous', [], 'invalid_model_plan'), valid: false };
  const evidence = evidenceFor(payload);
  const refusal = coverage(evidence);
  if (refusal) return refusal;
  const value = model.value;
  if (value.abstain) return { ...refuse(value.reason, value.missing, 'model_abstention'), declaredConfidence: value.confidence };
  const programs = programsFor(value, evidence);
  if (!programs) return refuse('ambiguous', [], 'rejected_model_program');
  const policy = abstention.evaluateAbstention({ confidence: value.confidence,
    uncertainty: 1 - value.confidence, integrity: 1, floor: 0.5 });
  if (policy.abstain) return refuse('ambiguous', [], 'confidence_gate');
  return { answer: evaluate(payload.query.expression, programs), confidence: value.confidence,
    abstain: false, reason: 'answerable', missing: [], source: 'validated_model_program', valid: true };
}

function witness(item, programs) {
  const program = programs.find(rule => rule.op === item.op);
  if (!program || program.epoch !== item.epoch) return { op: item.op, epoch: item.epoch, issue: 'missing_or_wrong_epoch' };
  if (matches(program, item)) return null;
  if (item.provided) return { op: item.op, issue: 'provided_rule_mismatch', providedRule: item.provided };
  const row = item.samples.find(sample => corpus.value(program, sample.x) !== sample.y);
  return { op: item.op, epoch: item.epoch, x: row.x, observed: row.y,
    predicted: corpus.value(program, row.x), issue: 'training_sample_mismatch' };
}

function feedback(payload, model) {
  if (!model.valid || model.value.abstain) return null;
  const evidence = evidenceFor(payload);
  if (coverage(evidence) || programsFor(model.value, evidence)) return null;
  const witnesses = evidence.map(item => witness(item, model.value.programs)).filter(Boolean);
  return { rejectedPrograms: model.value.programs, witnesses };
}

module.exports = { refuse, evidenceFor, coverage, matches, programsFor, evaluate, execute, feedback };
