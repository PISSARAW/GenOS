"use strict";

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function cryptobioticState(input = {}) {
  return {
    id: input.id || `crypto-${Date.now()}`,
    procedure: input.procedure || null,
    cryptobiotic: input.cryptobiotic ?? false,
    rehydratedAt: input.rehydratedAt || null,
    dormantSince: input.dormantSince || null,
  };
}

function enterCryptobiosis(state) {
  return { ...state, cryptobiotic: true, dormantSince: new Date().toISOString() };
}

function rehydrate(state, options = {}) {
  return { ...state, cryptobiotic: false, rehydratedAt: new Date().toISOString(), ...options };
}

function isCryptobiotic(state) {
  return state.cryptobiotic === true;
}

function energyCost(state) {
  if (state.cryptobiotic) return 0.01;
  return 1.0;
}

module.exports = {
  cryptobioticState,
  enterCryptobiosis,
  rehydrate,
  isCryptobiotic,
  energyCost,
};
