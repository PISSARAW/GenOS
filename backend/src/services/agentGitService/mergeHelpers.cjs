'use strict';

const { identityOf } = require('./sectionIdentity.cjs');

function filterOps(operations, section, op) {
  return operations.filter(o => o.section === section && o.op === op);
}

function sameContent(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildOpMaps(ctx) {
  const { patchLeft, patchRight, sectionName } = ctx;
  return {
    leftAdds: indexById(filterOps(patchLeft.operations, sectionName, 'ADD'), sectionName),
    leftReplaces: indexReplace(filterOps(patchLeft.operations, sectionName, 'REPLACE')),
    leftRemoves: new Set(filterOps(patchLeft.operations, sectionName, 'REMOVE').map(o => o.itemId)),
    rightAdds: indexById(filterOps(patchRight.operations, sectionName, 'ADD'), sectionName),
    rightReplaces: indexReplace(filterOps(patchRight.operations, sectionName, 'REPLACE')),
    rightRemoves: new Set(filterOps(patchRight.operations, sectionName, 'REMOVE').map(o => o.itemId))
  };
}

function indexById(addOps, sectionName) {
  const map = new Map();
  for (const op of addOps) map.set(identityOf(sectionName, op.item), op.item);
  return map;
}

function indexReplace(replaceOps) {
  const map = new Map();
  for (const op of replaceOps) map.set(op.itemId, op.item);
  return map;
}

function mergeArraySection(ctx) {
  const { base, patchLeft, patchRight, sectionName } = ctx;
  const maps = buildOpMaps({ patchLeft, patchRight, sectionName });
  const baseRes = mergeBaseIds({ base, maps, sectionName });
  const addRes = mergeAddedIds({ maps, sectionName, seen: baseRes.seen });
  return {
    merged: [...baseRes.merged, ...addRes.merged],
    conflicts: [...baseRes.conflicts, ...addRes.conflicts]
  };
}

function mergeBaseIds(ctx) {
  const { base, maps, sectionName } = ctx;
  const merged = [];
  const conflicts = [];
  const seen = new Set();
  for (const item of base || []) {
    mergeOneBase({ item, maps, sectionName, merged, conflicts, seen });
  }
  return { merged, conflicts, seen };
}

function mergeOneBase(ctx) {
  const { item, maps, sectionName, merged, conflicts, seen } = ctx;
  const id = identityOf(sectionName, item);
  const left = changeOf({ id, replaces: maps.leftReplaces, removes: maps.leftRemoves });
  const right = changeOf({ id, replaces: maps.rightReplaces, removes: maps.rightRemoves });
  const outcome = resolveBasePair({ id, sectionName, left, right, baseItem: item });
  if (outcome.conflict) conflicts.push(outcome.conflict);
  if (outcome.item !== undefined) {
    merged.push(outcome.item);
    seen.add(id);
  }
}

function changeOf(ctx) {
  const { id, replaces, removes } = ctx;
  if (removes.has(id)) return { kind: 'remove' };
  if (replaces.has(id)) return { kind: 'replace', item: replaces.get(id) };
  return { kind: 'unchanged' };
}

function resolveBasePair(ctx) {
  const { left, right } = ctx;
  if (left.kind === 'unchanged') return resolveRightChange(ctx);
  if (right.kind === 'unchanged') return resolveLeftChange(ctx);
  return resolveBothChanged(ctx);
}

function resolveRightChange(ctx) {
  const { right, baseItem } = ctx;
  if (right.kind === 'unchanged') return { item: baseItem };
  if (right.kind === 'replace') return { item: right.item };
  return {};
}

function resolveLeftChange(ctx) {
  const { left } = ctx;
  if (left.kind === 'replace') return { item: left.item };
  return {};
}

function resolveBothChanged(ctx) {
  const { id, sectionName, left, right } = ctx;
  if (left.kind === 'remove' && right.kind === 'remove') return {};
  if (left.kind === 'replace' && right.kind === 'replace') {
    return resolveDoubleReplace({ id, sectionName, left, right });
  }
  return { conflict: makeConflict({ sectionName, itemId: id, reason: 'remove-replace', left: left.item, right: right.item }) };
}

function resolveDoubleReplace(ctx) {
  const { id, sectionName, left, right } = ctx;
  if (sameContent(left.item, right.item)) return { item: left.item };
  return { conflict: makeConflict({ sectionName, itemId: id, reason: 'replace-replace', left: left.item, right: right.item }) };
}

function mergeAddedIds(ctx) {
  const { maps, seen } = ctx;
  const merged = [];
  const conflicts = [];
  const ids = new Set([...maps.leftAdds.keys(), ...maps.rightAdds.keys()]);
  for (const id of ids) {
    mergeOneAdded({ id, maps, seen, merged, conflicts });
  }
  return { merged, conflicts };
}

function mergeOneAdded(ctx) {
  const { id, maps, seen, merged, conflicts } = ctx;
  if (seen.has(id)) return;
  const hasLeft = maps.leftAdds.has(id);
  const hasRight = maps.rightAdds.has(id);
  if (hasLeft && !hasRight) {
    merged.push(maps.leftAdds.get(id));
    seen.add(id);
    return;
  }
  if (!hasLeft && hasRight) {
    merged.push(maps.rightAdds.get(id));
    seen.add(id);
    return;
  }
  const left = maps.leftAdds.get(id);
  const right = maps.rightAdds.get(id);
  if (sameContent(left, right)) {
    merged.push(left);
    seen.add(id);
    return;
  }
  conflicts.push(makeConflict({ sectionName: null, itemId: id, reason: 'add-add', left, right }));
}

function makeConflict(ctx) {
  const { sectionName, itemId, reason, left, right } = ctx;
  return { section: sectionName, itemId, reason, left, right };
}

function filterBaseItems(ctx) {
  const { base, leftRemoves, rightRemoves, sectionName } = ctx;
  const seen = new Set();
  const items = [];
  for (const item of base) {
    const id = identityOf(sectionName, item);
    if (leftRemoves.has(id) || rightRemoves.has(id)) continue;
    items.push(item);
    seen.add(id);
  }
  return { items, seen };
}

function appendAddOps(ctx) {
  const { result, seen, addOps, conflictingRemoves, sectionName } = ctx;
  for (const op of addOps) {
    const id = identityOf(sectionName, op.item);
    if (!seen.has(id) && !conflictingRemoves.has(id)) {
      result.push(op.item);
      seen.add(id);
    }
  }
}

module.exports = { mergeArraySection, filterOps, filterBaseItems, appendAddOps };
