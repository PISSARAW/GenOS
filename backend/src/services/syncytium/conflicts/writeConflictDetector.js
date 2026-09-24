'use strict';

const utils = require('./conflictUtils');
const MERGE_SAFE_TYPES = new Set(['MV_REGISTER', 'G_COUNTER', 'PN_COUNTER', 'ADD_WINS_SET', 'SEQUENCE']);

function detect({ operation, history, schema }) {
  const conflicts = [];
  for (const prior of history) {
    if (!utils.concurrentPair(prior, operation) || !utils.sameTarget(prior, operation)) continue;
    const type = conflictType(prior, operation, schema);
    if (type) conflicts.push(utils.conflict({ type, left: prior, right: operation, description: 'Concurrent writes target the same semantic value.' }));
  }
  return conflicts;
}

function conflictType(left, right, schema) {
  const path = utils.pathOf(right);
  const dataType = right.fieldType || left.fieldType || schema?.fields?.[path]?.dataType || 'LEGACY_LWW';
  if (dataType === 'STATE_MACHINE') return stateMachineConflict(left, right);
  if (MERGE_SAFE_TYPES.has(dataType)) return null;
  if (isSequenceInsert(dataType, right)) return null;
  return differingValues(left, right) ? 'WRITE_CONFLICT' : null;
}

function stateMachineConflict(left, right) {
  return differingTransitions(left, right) ? 'STATE_MACHINE_CONFLICT' : null;
}

function isSequenceInsert(dataType, operation) {
  return dataType === 'MAP' && operation.kind?.action === 'insert';
}

function differingTransitions(left, right) {
  return left.kind?.to !== right.kind?.to || left.kind?.from !== right.kind?.from;
}

function differingValues(left, right) {
  return JSON.stringify(operationValue(left)) !== JSON.stringify(operationValue(right));
}

function operationValue(operation) {
  return operation.kind?.value ?? operation.kind?.to ?? operation.kind?.delta;
}

module.exports = { detect };
