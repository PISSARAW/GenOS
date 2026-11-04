'use strict';

const corpus = require('../competence-five-arms/corpus.cjs');
const contracts = require('../competence-five-arms-v2/contracts.cjs');
const executor = require('../competence-five-arms-v2/executor.cjs');
const SIGNATURE_INPUTS = [-2, -1, 0, 1, 2, 7, 8];

function signature(rule) {
  return JSON.stringify(SIGNATURE_INPUTS.map(x => corpus.value(rule, x)));
}

function consistency(rule, observations) {
  const samples = observations.filter(row => row.op === rule.op && row.epoch === rule.epoch);
  if (!contracts.programValid(rule) || samples.length === 0) return false;
  return samples.every(row => corpus.value(rule, row.x) === row.y);
}

function identifiable(samples) {
  if (!samples.length) return false;
  const alternatives = corpus.candidates().filter(rule => samples.every(row => corpus.value(rule, row.x) === row.y));
  return new Set(alternatives.map(signature)).size === 1;
}

function parse(report) {
  if (report.fullTextTruncated) throw Error('TRUNCATED_CANDIDATE_ARTIFACT');
  const content = report.workerArtifact?.content;
  const parsed = JSON.parse(report.fullText || '{}');
  if (Array.isArray(parsed.functionPrograms?.rules)) return parsed.functionPrograms.rules;
  const raw = content?.artifactText || parsed.artifactText;
  const match = String(raw || '').match(/^<ARTIFACT: function-programs>([\s\S]*)<\/ARTIFACT>$/);
  if (!match) throw Error('FUNCTION_PROGRAM_ARTIFACT_REQUIRED');
  const value = JSON.parse(match[1]);
  if (!Array.isArray(value.rules)) throw Error('FUNCTION_RULE_ARRAY_REQUIRED');
  return value.rules;
}

function admit(input) {
  const accepted = [];
  const rejected = [];
  const seen = new Set();
  for (const rule of input.rules) {
    const key = `${rule.op}:${rule.epoch}`;
    const samples = input.observations.filter(row => `${row.op}:${row.epoch}` === key);
    const valid = rule.reason === 'answerable' && Number.isFinite(rule.confidence)
      && rule.confidence >= 0.5 && rule.confidence <= 1 && consistency(rule, input.observations)
      && identifiable(samples) && !seen.has(key);
    if (valid) { accepted.push(rule); seen.add(key); }
    else rejected.push(rule);
  }
  return { accepted, rejected };
}

function predict(input) {
  const ops = [...new Set(corpus.operators(input.query.expression))];
  const selected = ops.map(op => input.rules.find(rule => rule.op === op && rule.epoch === (input.query.epochs[op] || 0)));
  const missing = ops.filter(op => !input.observations.some(row => row.op === op && row.epoch === (input.query.epochs[op] || 0)));
  if (missing.length) return executor.refuse('missing', missing, 'public_coverage_guard');
  if (selected.some(rule => !rule)) return executor.refuse('ambiguous', [], 'public_program_guard');
  const map = Object.fromEntries(selected.map(rule => [rule.op, rule]));
  return { answer: executor.evaluate(input.query.expression, map), abstain: false,
    confidence: Math.min(...selected.map(rule => rule.confidence)), reason: 'answerable',
    missing: [], valid: true, source: 'native_llm_publicly_validated_program' };
}

module.exports = { signature, consistency, identifiable, parse, admit, predict };
