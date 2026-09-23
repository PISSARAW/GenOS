'use strict';

function computeRPE(outcome, expected) {
  return (outcome || 0) - (expected || 0);
}

function modulateByRPE(state, rpe) {
  const next = { ...state };
  if (rpe > 0) {
    next.dopamine = Math.min(1, (next.dopamine || 0) + rpe * 0.3);
    next.serotonin = Math.min(1, (next.serotonin || 0) + rpe * 0.1);
  } else if (rpe < 0) {
    next.cortisol = Math.min(1, (next.cortisol || 0) + Math.abs(rpe) * 0.3);
    next.adrenaline = Math.min(1, (next.adrenaline || 0) + Math.abs(rpe) * 0.15);
  }
  return next;
}

function decayHormones(state, rate) {
  const r = rate || 0.01;
  return {
    ...state,
    dopamine: Math.max(0, (state.dopamine || 0) - r),
    adrenaline: Math.max(0, (state.adrenaline || 0) - r * 2),
    cortisol: Math.max(0, (state.cortisol || 0) - r * 0.5),
    oxytocin: Math.max(0, (state.oxytocin || 0) - r * 0.3),
    serotonin: Math.max(0, (state.serotonin || 0) - r * 0.2),
    prolactin: Math.max(0, (state.prolactin || 0) - r * 0.1),
  };
}

function getHormoneState(agentId) {
  const store = getRegStore(agentId);
  return decayHormones(store || {}, 0.01);
}

const stores = new Map();
function getRegStore(agentId) {
  return stores.get(agentId) || {
    dopamine: 0.5, adrenaline: 0.1, cortisol: 0.1,
    oxytocin: 0.3, serotonin: 0.4, prolactin: 0.05,
  };
}

function setRegStore(agentId, state) {
  stores.set(agentId, state);
}

module.exports = { computeRPE, modulateByRPE, decayHormones, getHormoneState };
