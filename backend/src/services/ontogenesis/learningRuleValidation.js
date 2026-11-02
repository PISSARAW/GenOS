'use strict';

const { hash } = require('../identity/storage');
const VERSION = 'training-rule-v1';

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === keys;
}

function validAffine(rule) {
  return exactKeys(rule, 'a,b,kind') && Number.isSafeInteger(rule.a) && Number.isSafeInteger(rule.b);
}

function validText(rule) {
  return exactKeys(rule, 'kind,prefix,reverse,suffix,upper') && rule.kind === 'text'
    && typeof rule.prefix === 'string' && typeof rule.suffix === 'string'
    && /^\d{2}$/.test(rule.prefix) && /^\d{2}$/.test(rule.suffix)
    && typeof rule.reverse === 'boolean' && typeof rule.upper === 'boolean';
}

function validRule(rule) {
  return rule?.kind === 'affine' ? validAffine(rule) : validText(rule);
}

function evaluate(rule, input) {
  if (!validRule(rule)) throw new Error('LEARNING_RULE_INVALID');
  if (rule.kind === 'affine') {
    if (!Number.isSafeInteger(input)) throw new Error('LEARNING_INPUT_INVALID');
    const product = rule.a * input;
    if (!Number.isSafeInteger(product)) throw new Error('LEARNING_RESULT_OVERFLOW');
    const value = product + rule.b;
    if (!Number.isSafeInteger(value)) throw new Error('LEARNING_RESULT_OVERFLOW');
    return value;
  }
  if (typeof input !== 'string' || input.length > 4096) throw new Error('LEARNING_INPUT_INVALID');
  let value = rule.reverse ? [...input].reverse().join('') : input;
  if (rule.upper) value = value.toUpperCase();
  return rule.prefix + value + rule.suffix;
}

function validSamples(feedback) {
  if (!Array.isArray(feedback.examples) || feedback.examples.length < 2 || feedback.examples.length > 64) return false;
  if (!Array.isArray(feedback.taskIds) || feedback.taskIds.length !== feedback.examples.length) return false;
  return feedback.taskIds.every(id => typeof id === 'string' && id.length > 0)
    && new Set(feedback.taskIds).size === feedback.taskIds.length;
}

function validOperator(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(value)
    && !['constructor', 'prototype'].includes(value);
}

function validFeedback(feedback) {
  if (feedback?.phase !== 'train' || !['number', 'text'].includes(feedback.family)) return false;
  return validOperator(feedback.op) && validSamples(feedback);
}

function matches(rule, examples) {
  try { return examples.every(row => evaluate(rule, row.input) === row.output); }
  catch (_) { return false; }
}

function identifiable(rule, examples) {
  if (new Set(examples.map(row => row.input)).size < 2) return false;
  if (rule.kind === 'affine') return true;
  const alternatives = [false, true].flatMap(reverse => [false, true].map(upper => ({ ...rule, reverse, upper })));
  return alternatives.filter(candidate => matches(candidate, examples)).length === 1;
}

function validate(update, feedback) {
  if (!validFeedback(feedback)) return { accepted: false, reason: 'INSUFFICIENT_TRAINING_EVIDENCE' };
  if (update?.op !== feedback.op || !validRule(update?.rule)) return { accepted: false, reason: 'RULE_OR_OPERATOR_INVALID' };
  const expectedKind = feedback.family === 'number' ? 'affine' : 'text';
  if (update.rule.kind !== expectedKind || JSON.stringify(update.rule).length > 120) return { accepted: false, reason: 'RULE_DOMAIN_OR_SIZE_INVALID' };
  if (!matches(update.rule, feedback.examples)) return { accepted: false, reason: 'TRAINING_COUNTEREXAMPLE' };
  if (!identifiable(update.rule, feedback.examples)) return { accepted: false, reason: 'RULE_NOT_IDENTIFIED' };
  return { accepted: true, version: VERSION, candidateHash: hash(update), evidenceHash: hash(feedback),
    evidenceTaskIds: [...feedback.taskIds], scope: 'declared_rule_family_and_supplied_training_examples' };
}

module.exports = { validate, evaluate, validRule, validFeedback, matches };
