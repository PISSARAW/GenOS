"use strict";

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function methylationMarkFrom(input = {}) {
  return {
    id: input.id || `me-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    target: input.target || { type: "edge", from: "?", to: "?" },
    type: input.type || "repression",
    strength: clamp01(Number(input.strength) || 0.9),
    trigger: input.trigger || {},
    origin: input.origin || { policy: "default" },
    createdAt: input.createdAt || new Date().toISOString(),
    active: input.active == null ? true : Boolean(input.active),
  };
}

function isRepressive(mark) {
  return String(mark?.type || "").toLowerCase() === "repression";
}

function expressionAfterMethylation(expression, mark) {
  if (!isRepressive(mark) || !mark.active) return expression;
  return clamp01(Number(expression) * (1 - clamp01(Number(mark.strength) || 0)));
}

function targetsEdge(mark, from, to) {
  const t = mark?.target || {};
  return t.type === "edge" && t.from === from && t.to === to;
}

function targetsProcedure(mark, procedureId) {
  const t = mark?.target || {};
  return t.type === "procedure" && t.id === procedureId;
}

function methylationByEnvironment(marks = [], environment) {
  return marks.filter((m) => {
    if (!m.active) return false;
    const trigger = m.trigger || {};
    if (trigger.environment != null && String(trigger.environment) !== String(environment)) return false;
    return true;
  });
}

module.exports = {
  methylationMarkFrom,
  isRepressive,
  expressionAfterMethylation,
  targetsEdge,
  targetsProcedure,
  methylationByEnvironment,
};
