'use strict';

function appendTransition(history = [], transition) {
  if (!transition || !transition.from || !transition.to) throw new Error('transition endpoints are required');
  return [...history, { ...transition, recordedAt: transition.recordedAt || Date.now() }];
}

function transitionsFor(history = [], pair = {}) {
  return history.filter((item) => item.from === pair.from && item.to === pair.to);
}

module.exports = { appendTransition, transitionsFor };
