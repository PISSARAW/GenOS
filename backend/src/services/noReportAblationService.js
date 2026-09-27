'use strict';

function validateRegistration(input) {
  const data = input || {};
  if (!data.protocolId || !Array.isArray(data.factors) || data.factors.length < 2) throw Object.assign(new Error('Ablation registration requires protocol and factors'), { code: 'INVALID_ABLATION_PROTOCOL' });
  return { protocolId: data.protocolId, factors: data.factors.map(String), preregistered: true, registeredAt: new Date().toISOString() };
}

function scoreBehavior(run) {
  const data = run || {};
  const behavior = data.behavior || {};
  const values = Object.values(behavior).map(Number).filter(Number.isFinite);
  return { score: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, textIgnored: true, claimsCount: Array.isArray(data.textClaims) ? data.textClaims.length : 0 };
}

function factorialCompare(runs) {
  const list = Array.isArray(runs) ? runs : [];
  const scored = list.map((run) => ({ id: run.id, factors: run.factors || {}, ...scoreBehavior(run) }));
  const byFactor = {};
  for (const run of scored) for (const [factor, value] of Object.entries(run.factors)) byFactor[factor] = byFactor[factor] || { on: [], off: [] };
  for (const run of scored) for (const [factor, value] of Object.entries(run.factors)) byFactor[factor][value ? 'on' : 'off'].push(run.score);
  const effects = Object.fromEntries(Object.entries(byFactor).map(([factor, values]) => [factor, mean(values.on) - mean(values.off)]));
  return { scored, effects, interactions: scored.length >= 4, independentOfReportText: scored.every((run) => run.textIgnored) };
}

function mean(values) { return values.length ? values.reduce((sum, value) => sum + (value || 0), 0) / values.length : 0; }

module.exports = { validateRegistration, scoreBehavior, factorialCompare };
