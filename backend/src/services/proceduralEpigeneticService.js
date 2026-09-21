"use strict";

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function expressionForEnvironment(procedure, environment) {
  const marks = procedure?.epigenetic_marks || {};
  const envMarks = marks[environment] || marks.default || {};
  const expression = clamp01(Number(envMarks.expression) ?? 1);
  return {
    procedureId: procedure?.id || null,
    environment,
    expression,
    mode: expression > 0.66 ? "enabled" : expression > 0.33 ? "conditional" : "silenced",
    note: envMarks.note || null,
  };
}

function expressedPhenotype(genome, environment) {
  const phenotype = genome?.expressedPhenotype || genome?.phenotype || {};
  if (!phenotype || typeof phenotype !== "object") return {};
  const result = {};
  for (const [procId, proc] of Object.entries(phenotype.procedures || {})) {
    result[procId] = {
      procedure: proc,
      expression: expressionForEnvironment(proc, environment),
    };
  }
  return result;
}

function isExpressed(expression) {
  return expression > 0.5;
}

function isEnabled(expression) {
  return expression > 0.66;
}

function isSilenced(expression) {
  return expression <= 0.33;
}

module.exports = {
  expressionForEnvironment,
  expressedPhenotype,
  isExpressed,
  isEnabled,
  isSilenced,
};
