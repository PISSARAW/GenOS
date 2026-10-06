'use strict';

function unionVolume(boxes) {
  if (!boxes.length || !boxes[0].length) return 0;
  const valid = boxes.filter(box => box.length === boxes[0].length
    && box.every(value => Number.isFinite(value) && value > 0));
  const frontier = nonDominated(valid);
  if (frontier.length <= 20) return Math.max(0, inclusionExclusion(frontier));
  const state = { remaining: 500000 };
  const value = sweep(frontier, state);
  return state.remaining < 0 ? null : value;
}

function sweep(boxes, state) {
  state.remaining -= boxes.length;
  if (state.remaining < 0) return 0;
  if (!boxes.length) return 0;
  if (boxes[0].length === 1) return Math.max(...boxes.map(box => box[0]));
  const boundaries = [...new Set([0, ...boxes.map(box => box[0])])].sort((a, b) => a - b);
  let volume = 0;
  for (let i = 1; i < boundaries.length; i += 1) {
    const active = boxes.filter(box => box[0] >= boundaries[i]).map(box => box.slice(1));
    volume += (boundaries[i] - boundaries[i - 1]) * sweep(nonDominated(active), state);
  }
  return volume;
}

function inclusionExclusion(boxes) {
  function visit(index, intersection, sign) {
    let volume = 0;
    for (let i = index; i < boxes.length; i += 1) {
      const next = intersection ? intersection.map((value, dim) => Math.min(value, boxes[i][dim])) : boxes[i];
      volume += sign * next.reduce((product, value) => product * value, 1);
      volume += visit(i + 1, next, -sign);
    }
    return volume;
  }
  return visit(0, null, 1);
}

function nonDominated(boxes) {
  return boxes.filter((box, index) => !boxes.some((other, otherIndex) => otherIndex !== index
    && other.every((value, dim) => value >= box[dim])
    && (otherIndex < index || other.some((value, dim) => value > box[dim]))));
}

module.exports = { unionVolume };
