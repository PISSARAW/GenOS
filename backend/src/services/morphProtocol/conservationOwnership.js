'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const { fail, same, sameIds } = require('./conservationRecords');

const transferKey = (kind, id) => digest([kind, id]);

function transfers(plan) {
  const indexed = new Map();
  for (const transfer of plan.transfers) {
    const key = transferKey(transfer.kind, transfer.id);
    if (indexed.has(key)) fail(`duplicate ownership transfer: ${transfer.kind}/${transfer.id}.`);
    if (same(transfer.from, transfer.to)) fail('ownership transfer must change its owner.');
    indexed.set(key, transfer);
  }
  return indexed;
}

function compareOwner(pair, context) {
  const { source, target, kind, id, ownerKey } = pair;
  if (!context.source.members.has(digest(source[ownerKey]))) fail(`${kind} source owner missing: ${id}.`);
  if (!context.target.members.has(digest(target[ownerKey]))) fail(`${kind} target owner missing: ${id}.`);
  if (same(source[ownerKey], target[ownerKey])) return;
  const key = transferKey(kind, id);
  const transfer = context.transfers.get(key);
  if (!transfer || !same(transfer.from, source[ownerKey]) || !same(transfer.to, target[ownerKey])) {
    fail(`${kind} owner changed without exact explicit transfer: ${id}.`);
  }
  context.consumed.add(key);
}

function withoutOwner(value, ownerKey) {
  const result = { ...value };
  delete result[ownerKey];
  return result;
}

function ownedRecords(kind, context) {
  const source = context.source[kind];
  const target = context.target[kind];
  sameIds(source, target, kind);
  for (const [id, item] of source) {
    const next = target.get(id);
    if (!same(withoutOwner(item, 'owner'), withoutOwner(next, 'owner'))) fail(`${kind} content changed: ${id}.`);
    compareOwner({ source: item, target: next, kind, id, ownerKey: 'owner' }, context);
  }
}

function subset(values, allowed, label) {
  const permitted = new Set(allowed);
  if (values.some((value) => !permitted.has(value))) fail(`${label} rights expanded.`);
}

function permissions(context) {
  for (const [id, item] of context.target.permissions) {
    const previous = context.source.permissions.get(id);
    if (!previous) fail(`new permission grant: ${id}.`);
    if (!same(previous.conditions, item.conditions)) fail(`permission conditions changed: ${id}.`);
    subset(item.resources, previous.resources, 'resource');
    subset(item.actions, previous.actions, 'action');
    compareOwner({ source: previous, target: item, kind: 'permissions', id, ownerKey: 'holder' }, context);
  }
  for (const [id, item] of context.source.permissions) {
    if (!context.source.members.has(digest(item.holder))) fail(`permission source holder missing: ${id}.`);
  }
}

function budgets(context) {
  ownedRecords('budgets', context);
  for (const item of context.source.budgets.values()) {
    if (item.reserved > item.limit || item.spent > item.limit - item.reserved) fail(`budget exceeds limit: ${item.budgetId}.`);
  }
}

function verifyOwnership(plan, indexes) {
  const context = { ...indexes, transfers: transfers(plan), consumed: new Set() };
  for (const kind of ['tasks', 'obligations', 'unknownEffects']) ownedRecords(kind, context);
  permissions(context);
  budgets(context);
  if (context.consumed.size !== context.transfers.size) fail('unused or dangling ownership transfer.');
}

module.exports = { verifyOwnership };
