'use strict';

const context = require('./causalContext');

function merge(left, right) {
  const result = context.normalize(left);
  for (const [actor, sequence] of Object.entries(context.normalize(right))) {
    result[actor] = Math.max(result[actor] || 0, sequence);
  }
  return result;
}

function observe(frontier, actor, sequence) {
  return merge(frontier, { [actor]: sequence });
}

function compare(left, right) {
  const actors = new Set([...Object.keys(context.normalize(left)), ...Object.keys(context.normalize(right))]);
  let leftAhead = false;
  let rightAhead = false;
  for (const actor of actors) {
    const order = compareActor(left, right, actor);
    leftAhead ||= order > 0;
    rightAhead ||= order < 0;
  }
  if (leftAhead && rightAhead) return 'CONCURRENT';
  if (leftAhead) return 'AFTER';
  if (rightAhead) return 'BEFORE';
  return 'EQUAL';
}

function compareActor(left, right, actor) {
  return (left[actor] || 0) - (right[actor] || 0);
}

module.exports = { merge, observe, compare };
