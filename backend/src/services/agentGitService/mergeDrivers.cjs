'use strict';

function idOf(items, key) {
  return new Set((items || []).map(e => e[key]));
}

function mergeById(ctx) {
  const { base, left, right, key } = ctx;
  const baseMap = new Map((base || []).map(e => [e[key], e]));
  const out = new Map(baseMap);
  applySide({ out, baseMap, side: left, key });
  applySide({ out, baseMap, side: right, key });
  const seen = new Set();
  const result = [];
  for (const item of [...(base || []), ...(left || []), ...(right || [])]) {
    const id = item[key];
    if (out.has(id) && !seen.has(id)) {
      result.push(out.get(id));
      seen.add(id);
    }
  }
  return result;
}

function applySide(ctx) {
  const { out, baseMap, side, key } = ctx;
  for (const item of side || []) {
    const id = item[key];
    if (!baseMap.has(id)) {
      if (!out.has(id)) out.set(id, item);
      continue;
    }
    if (JSON.stringify(baseMap.get(id)) !== JSON.stringify(item)) out.set(id, item);
  }
}

function mergeEvents(ctx) {
  return mergeById({ ...ctx, key: 'event_id' });
}

function mergeChildren(ctx) {
  return mergeById({ ...ctx, key: 'id' });
}

function mergeChildrenGoverned(ctx) {
  const base = new Map((ctx.base || []).map((item) => [item.id, item]));
  const left = new Map((ctx.left || []).map((item) => [item.id, item]));
  const right = new Map((ctx.right || []).map((item) => [item.id, item]));
  const merged = [];
  const conflicts = [];
  const ids = new Set([...base.keys(), ...left.keys(), ...right.keys()]);
  for (const id of ids) mergeChild({ id, base: base.get(id), left: left.get(id), right: right.get(id), merged, conflicts });
  return { merged, conflicts };
}

function mergeChild(ctx) {
  const leftChanged = !sameRecord(ctx.base, ctx.left);
  const rightChanged = !sameRecord(ctx.base, ctx.right);
  if (leftChanged && rightChanged && !sameRecord(ctx.left, ctx.right)) {
    ctx.conflicts.push({ section: 'children', id: ctx.id, type: 'divergent_relationship', base: ctx.base || null, left: ctx.left || null, right: ctx.right || null, resolution: 'required' });
    return;
  }
  const selected = rightChanged ? ctx.right : ctx.left;
  if (selected) ctx.merged.push(selected);
}

function sameRecord(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeDecisions(ctx) {
  return mergeById({ ...ctx, key: 'id' });
}

function mergeMemories(ctx) {
  return mergeById({ ...ctx, key: 'id' });
}

function mergeRuns(ctx) {
  return mergeById({ ...ctx, key: 'id' });
}

function mergePlasmids(ctx) {
  return mergeById({ ...ctx, key: 'plasmid_id' });
}

module.exports = {
  mergeEvents,
  mergeChildren,
  mergeChildrenGoverned,
  mergeDecisions,
  mergeMemories,
  mergeRuns,
  mergePlasmids
};
