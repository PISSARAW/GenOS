'use strict';

function constrain(policy, requested = {}) {
  const adjustable = ['selection', 'temperature', 'random', 'maxStates', 'maxWork', 'onWork'];
  const overrides = Object.fromEntries(adjustable.filter(key => requested[key] !== undefined).map(key => [key, requested[key]]));
  const effective = { ...policy, ...overrides };
  if (Number.isSafeInteger(requested.maxHops) && requested.maxHops > 0) {
    effective.maxHops = Math.min(policy.maxHops || requested.maxHops, requested.maxHops);
  }
  return effective;
}

module.exports = { constrain };
