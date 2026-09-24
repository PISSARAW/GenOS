'use strict';

const HANDLERS = Object.freeze({
  LWW_REGISTER: applyLww,
  MV_REGISTER: applyMultiValue,
  G_COUNTER: applyGrowCounter,
  PN_COUNTER: applyPnCounter,
  ADD_WINS_SET: applyAddWinsSet,
  MAP: applyMap,
  SEQUENCE: applySequence,
  STATE_MACHINE: applyStateMachine
});

function supports(dataType, action) {
  const actions = {
    LWW_REGISTER: ['assign'], MV_REGISTER: ['assign'], G_COUNTER: ['increment'],
    PN_COUNTER: ['increment'], ADD_WINS_SET: ['add', 'remove'], MAP: ['set', 'delete'],
    SEQUENCE: ['insert', 'delete'], STATE_MACHINE: ['transition']
  };
  return Boolean(actions[dataType]?.includes(action));
}

function apply(fields, operation, metadata) {
  const { key, action } = operation.kind;
  const handler = HANDLERS[operation.fieldType];
  if (!handler) throw typedError(`No CRDT handler for '${operation.fieldType}'.`);
  const entry = fieldEntry(fields, key, operation.fieldType);
  handler(entry, operation.kind, metadata);
}

function fieldEntry(fields, key, dataType) {
  if (!fields[key]) fields[key] = { dataType };
  if (fields[key].dataType !== dataType) throw typedError(`Field '${key}' changed CRDT type.`);
  return fields[key];
}

function applyLww(entry, kind, operation) {
  const stamp = operationStamp(operation);
  if (!entry.register || compareStamps(stamp, entry.register.stamp) > 0) {
    entry.register = { value: kind.value, stamp };
  }
}

function applyMultiValue(entry, kind, operation) {
  entry.values = entry.values || {};
  entry.values[operation.opId] = kind.value;
}

function applyGrowCounter(entry, kind, operation) {
  const delta = Number(kind.delta);
  if (!Number.isSafeInteger(delta) || delta < 1) throw typedError('G_COUNTER requires a positive integer delta.');
  entry.components = entry.components || {};
  entry.components[operation.actorId || operation.agentId || 'unknown'] =
    (entry.components[operation.actorId || operation.agentId || 'unknown'] || 0) + delta;
}

function applyPnCounter(entry, kind, operation) {
  const delta = Number(kind.delta);
  if (!Number.isSafeInteger(delta) || delta === 0) throw typedError('PN_COUNTER requires a non-zero integer delta.');
  const actor = operation.actorId || operation.agentId || 'unknown';
  const component = delta > 0 ? 'positive' : 'negative';
  entry[component] = entry[component] || {};
  entry[component][actor] = (entry[component][actor] || 0) + Math.abs(delta);
}

function applyAddWinsSet(entry, kind, operation) {
  const valueKey = JSON.stringify(kind.value);
  entry.adds = entry.adds || {};
  entry.removed = entry.removed || [];
  if (kind.action === 'add') {
    entry.adds[valueKey] = entry.adds[valueKey] || { value: kind.value, tags: [] };
    entry.adds[valueKey].tags.push(operation.opId);
    return;
  }
  const tags = Array.isArray(kind.observedTags) ? kind.observedTags : [];
  entry.removed.push(...tags);
}

function applyMap(entry, kind, operation) {
  const key = String(kind.entryKey || '');
  if (!key) throw typedError('MAP operation requires entryKey.');
  entry.entries = entry.entries || {};
  const stamp = operationStamp(operation);
  const current = entry.entries[key];
  if (!current || compareStamps(stamp, current.stamp) > 0) {
    entry.entries[key] = { value: kind.action === 'delete' ? null : kind.value, deleted: kind.action === 'delete', stamp };
  }
}

function applySequence(entry, kind, operation) {
  entry.elements = entry.elements || {};
  if (kind.action === 'insert') {
    const id = String(kind.elementId || operation.opId);
    entry.elements[id] = { id, afterId: kind.afterId || null, value: kind.value, deleted: false };
  } else {
    const element = entry.elements[String(kind.elementId || '')];
    if (element) element.deleted = true;
  }
}

function applyStateMachine(entry, kind, operation) {
  if (entry.value === kind.to) return;
  const from = entry.value === undefined ? kind.from : entry.value;
  const allowed = Array.isArray(operation.fieldRules?.allowedTransitions) ? operation.fieldRules.allowedTransitions : [];
  const permitted = allowed.some((item) => item.from === from && item.to === kind.to);
  if (!permitted) throw typedError(`Transition '${from}' → '${kind.to}' is not declared.`);
  entry.value = kind.to;
}

function materialize(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, entry]) => [key, materializeEntry(entry)]));
}

const MATERIALIZERS = Object.freeze({
  LWW_REGISTER: (entry) => entry.register?.value,
  MV_REGISTER: (entry) => Object.values(entry.values || {}),
  G_COUNTER: (entry) => sum(Object.values(entry.components || {})),
  PN_COUNTER: (entry) => sum(Object.values(entry.positive || {})) - sum(Object.values(entry.negative || {})),
  ADD_WINS_SET: materializeSet,
  MAP: materializeMap,
  SEQUENCE: materializeSequence
});

function materializeEntry(entry) {
  return (MATERIALIZERS[entry.dataType] || (() => entry.value))(entry);
}

function materializeSet(entry) {
  const removed = new Set(entry.removed || []);
  return Object.values(entry.adds || {}).filter((item) => item.tags.some((tag) => !removed.has(tag))).map((item) => item.value);
}

function materializeMap(entry) {
  return Object.fromEntries(Object.entries(entry.entries || {}).filter(([, item]) => !item.deleted).map(([key, item]) => [key, item.value]));
}

function materializeSequence(entry) {
  const groups = groupByAnchor(Object.values(entry.elements || {}));
  return flattenSequence(groups, null, new Set()).map((item) => item.value);
}

function groupByAnchor(elements) {
  const groups = {};
  for (const element of elements) {
    const anchor = element.afterId || '';
    groups[anchor] = groups[anchor] || [];
    groups[anchor].push(element);
  }
  for (const group of Object.values(groups)) group.sort((left, right) => left.id.localeCompare(right.id));
  return groups;
}

function flattenSequence(groups, anchor, visited) {
  const result = [];
  for (const element of groups[anchor || ''] || []) {
    if (visited.has(element.id)) continue;
    visited.add(element.id);
    if (!element.deleted) result.push(element);
    result.push(...flattenSequence(groups, element.id, visited));
  }
  return result;
}

function operationStamp(operation) {
  return { lamport: Number(operation.lamport) || 0, actor: String(operation.actorId || operation.agentId || ''), opId: String(operation.opId || '') };
}

function compareStamps(left, right) {
  return left.lamport - right.lamport || left.actor.localeCompare(right.actor) || left.opId.localeCompare(right.opId);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function typedError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_CRDT_OPERATION_INVALID' });
}

module.exports = { supports, apply, materialize };
