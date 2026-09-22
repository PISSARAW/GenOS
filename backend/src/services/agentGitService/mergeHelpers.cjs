'use strict';

function mergeArraySection(ctx) {
  const { base, patchLeft, patchRight, sectionName } = ctx;
  const leftAdds = new Set(filterOps(patchLeft.operations, sectionName, 'ADD').map(o => o.item.id));
  const leftRemoves = new Set(filterOps(patchLeft.operations, sectionName, 'REMOVE').map(o => o.itemId));
  const rightAdds = new Set(filterOps(patchRight.operations, sectionName, 'ADD').map(o => o.item.id));
  const rightRemoves = new Set(filterOps(patchRight.operations, sectionName, 'REMOVE').map(o => o.itemId));

  const kept = filterBaseItems(base, leftRemoves, rightRemoves);
  const result = [...kept.items];
  const seen = new Set(kept.seen);

  appendAddOps({ result, seen, addOps: filterOps(patchLeft.operations, sectionName, 'ADD'), conflictingRemoves: rightRemoves });
  appendAddOps({ result, seen, addOps: filterOps(patchRight.operations, sectionName, 'ADD'), conflictingRemoves: leftRemoves });
  return result;
}

function filterOps(operations, section, op) {
  return operations.filter(o => o.section === section && o.op === op);
}

function filterBaseItems(base, leftRemoves, rightRemoves) {
  const seen = new Set();
  const items = [];
  for (const item of base) {
    if (leftRemoves.has(item.id) || rightRemoves.has(item.id)) continue;
    items.push(item);
    seen.add(item.id);
  }
  return { items, seen };
}

function appendAddOps(ctx) {
  const { result, seen, addOps, conflictingRemoves } = ctx;
  for (const op of addOps) {
    if (!seen.has(op.item.id) && !conflictingRemoves.has(op.item.id)) {
      result.push(op.item);
      seen.add(op.item.id);
    }
  }
}

module.exports = { mergeArraySection, filterOps, filterBaseItems, appendAddOps };
