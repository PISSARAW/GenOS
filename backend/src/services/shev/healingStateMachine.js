'use strict';

const EDGES = Object.freeze({
  lesion: new Set(['hemostasis', 'scarred']),
  hemostasis: new Set(['inflammation', 'scarred']),
  inflammation: new Set(['proliferation', 'scarred']),
  proliferation: new Set(['remodeling', 'scarred']),
  remodeling: new Set(['healed', 'relapsed', 'scarred']),
  healed: new Set(),
  relapsed: new Set(),
  scarred: new Set()
});

const TERMINAL = new Set(['healed', 'relapsed', 'scarred']);

function canTransition(from, to) {
  return EDGES[from]?.has(to) === true;
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid SHEV healing transition: ${from} -> ${to}.`);
  }
}

function isTerminal(phase) {
  return TERMINAL.has(phase);
}

module.exports = { assertTransition, canTransition, isTerminal };
