export function metric(value, source = 'runtime', observedZero = false) {
  if (!Number.isFinite(value) || value < 0) return 'Inconnu';
  if (value === 0 && !observedZero) return 'Inconnu';
  return `${value} (${source})`;
}

export function runMetrics(run) {
  const metrics = run.metrics || {};
  return [
    ['Tokens', metric(metrics.tokens, metrics.estimated ? 'estimation' : 'déclaré par le runtime', metrics.usageReported === true)],
    ['Coût USD', metric(metrics.costUsd, metrics.costEstimated ? 'estimation' : 'déclaré par le runtime', metrics.costReported === true)],
    ['Durée ms', metric(metrics.latencyMs)],
    ['Budget tokens', metric(run.budget?.tokens, 'plafond')],
    ['Budget USD', metric(run.budget?.costUsd, 'plafond')],
    ['Blocage', run.guardrailReason || 'Aucun blocage signalé']
  ];
}
