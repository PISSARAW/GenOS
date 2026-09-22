'use strict';

const { identityOf } = require('./sectionIdentity.cjs');

function mergeArraySection(ctx) {
  const { base, patchLeft, patchRight, sectionName } = ctx;
  const leftAdds = new Set(filterOps(patchLeft.operations, sectionName, 'ADD').map(o => identityOf(sectionName, o.item)));
  const leftRemoves = new Set(filterOps(patchLeft.operations, sectionName, 'REMOVE').map(o => o.itemId));
  const rightAdds = new Set(filterOps(patchRight.operations, sectionName, 'ADD').map(o => identityOf(sectionName, o.item)));
  const rightRemoves = new Set(filterOps(patchRight.operations, sectionName, 'REMOVE').map(o => o.itemId));

  const kept = filterBaseItems({ base, leftRemoves, rightRemoves, sectionName });
  const result = [...kept.items];
  const seen = new Set(kept.seen);

  appendAddOps({ result, seen, addOps: filterOps(patchLeft.operations, sectionName, 'ADD'), conflictingRemoves: rightRemoves, sectionName });
  appendAddOps({ result, seen, addOps: filterOps(patchRight.operations, sectionName, 'ADD'), conflictingRemoves: leftRemoves, sectionName });
  return result;
}

function filterOps(operations, section, op) {
  return operations.filter(o => o.section === section && o.op === op);
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
