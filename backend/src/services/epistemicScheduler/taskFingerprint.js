'use strict';

const { createHash } = require('node:crypto');
const { pack } = require('msgpackr');

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

function normalizeAssumptions(value = []) {
  if (!Array.isArray(value)) throw new Error('assumptions must be an array.');
  return value.map((item, index) => [
    text(item?.id, `assumptions[${index}].id`),
    text(item?.statement, `assumptions[${index}].statement`),
  ]).sort((left, right) => left[0].localeCompare(right[0]));
}

function normalizeDomain(value = {}) {
  if (!Array.isArray(value.constraints)) throw new Error('validityDomain.constraints must be an array.');
  return [
    text(value.statement, 'validityDomain.statement'),
    value.constraints.map((item, index) => text(item, `validityDomain.constraints[${index}]`)).sort(),
  ];
}

function normalizeDependencies(value = []) {
  if (!Array.isArray(value)) throw new Error('dependencies must be an array.');
  return value.map((item, index) => [
    text(item?.resultId, `dependencies[${index}].resultId`),
    text(item?.relation || 'uses', `dependencies[${index}].relation`),
  ]).sort((left, right) => left[0].localeCompare(right[0]));
}

function canonicalTask(task = {}) {
  return [
    text(task.canonicalStatement || task.statement, 'canonicalStatement'),
    normalizeAssumptions(task.assumptions),
    normalizeDomain(task.validityDomain),
    normalizeDependencies(task.dependencies),
  ];
}

function taskFingerprint(task) {
  const bytes = pack(canonicalTask(task));
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

module.exports = { canonicalTask, taskFingerprint };
