'use strict';

const { randomUUID } = require('node:crypto');

function propose(options) {
  validate(options);
  const known = new Set(options.edges.map(edgeKey));
  const components = [...new Set(options.components)].filter((item) => typeof item === 'string' && item.trim());
  const proposals = [];
  for (const signal of options.discrepancies) {
    const target = signal.component || options.target;
    for (const source of components) {
      if (source === target || known.has(`${source}|${target}|influences`)) continue;
      proposals.push(hypothesis({ source, target, signal, evidenceRefs: options.evidenceRefs }));
    }
    if (signal.unexplained === true) proposals.push(hypothesis({ source: `latent:${signal.metric}`,
      target, signal, evidenceRefs: options.evidenceRefs }));
  }
  return proposals;
}

function hypothesis(input) {
  return { hypothesisId: randomUUID(), source: input.source, target: input.target,
    relation: 'influences', status: 'hypothesis', causalStatus: 'unknown', metric: input.signal.metric,
    residual: input.signal.observed - input.signal.predicted, confidence: 0.05,
    evidenceRefs: [...input.evidenceRefs] };
}

function planInterventions(hypotheses, budget) {
  const maximum = Number(budget?.maxInterventions);
  if (!Array.isArray(hypotheses) || !Number.isInteger(maximum) || maximum < 1 || maximum > 10) {
    throw new TypeError('Bounded Self-Twin intervention budget required.');
  }
  return hypotheses.slice(0, maximum).map((edge) => ({ interventionId: randomUUID(),
    hypothesisId: edge.hypothesisId, target: edge.source, comparator: 'matched_control',
    design: 'randomized_controlled', isolationRequired: true, status: 'proposal_only' }));
}

function edgeKey(edge) { return `${edge.source}|${edge.target}|${edge.relation}`; }

function validate(options) {
  if (!options?.target || !Array.isArray(options.components) || !Array.isArray(options.edges)
    || !Array.isArray(options.discrepancies) || !Array.isArray(options.evidenceRefs)) {
    throw new TypeError('Self-Twin dependency discovery input invalid.');
  }
  if (options.discrepancies.some((item) => !item?.metric || !Number.isFinite(item.predicted)
    || !Number.isFinite(item.observed))) throw new TypeError('Self-Twin discrepancy must be numeric.');
}

module.exports = { propose, planInterventions, validate };
