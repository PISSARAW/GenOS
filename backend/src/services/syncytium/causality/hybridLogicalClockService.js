'use strict';

function tick(input = {}) {
  const previous = normalize(input.previous);
  const remote = normalize(input.remote);
  const physical = validTime(input.wallTime);
  const wallTime = Math.max(physical, previous.wallTime, remote.wallTime);
  let logical = 0;
  if (wallTime === previous.wallTime && wallTime === remote.wallTime) logical = Math.max(previous.logical, remote.logical) + 1;
  else if (wallTime === previous.wallTime) logical = previous.logical + 1;
  else if (wallTime === remote.wallTime) logical = remote.logical + 1;
  return { wallTime, logical, actorId: String(input.actorId || '') };
}

function normalize(value) {
  if (!value) return { wallTime: 0, logical: 0 };
  if (!Number.isSafeInteger(value.wallTime) || value.wallTime < 0
    || !Number.isSafeInteger(value.logical) || value.logical < 0) {
    throw clockError('Hybrid logical clock values must be non-negative safe integers.');
  }
  return value;
}

function validTime(value) {
  const time = value === undefined ? Date.now() : value;
  if (!Number.isSafeInteger(time) || time < 0) throw clockError('Hybrid logical clock wall time must be a non-negative safe integer.');
  return time;
}

function clockError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_HLC_INVALID' });
}

module.exports = { tick };
