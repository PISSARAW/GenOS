'use strict';

const base = require('./experienceCompetence/learning');
const { digest, ruleValid } = require('./experienceCompetence/contract');

function synthesize(samples) {
  if (new Set(samples.map(row => row.x)).size < 3) return null;
  const first = samples[0];
  const second = samples.find(row => row.x !== first.x);
  const a = (second.y - first.y) / (second.x - first.x);
  const rule = { a, b: first.y - a * first.x };
  if (!ruleValid(rule) || !samples.every(row => rule.a * row.x + rule.b === row.y)) return null;
  return rule;
}

function consider(state, input) {
  const next = base.consider(state, input);
  const modelProposal = next.proposals.at(-1);
  if (modelProposal.accepted) {
    next.procedures[input.op].source = { kind: 'model', ref: input.sourceRef };
    return next;
  }
  if (next.procedures[input.op]) return next;
  const samples = next.observations[input.op] || [];
  const rule = synthesize(samples);
  const program = base.consolidate(input.op, rule, samples);
  if (!program) return next;
  const ref = digest({ kind: 'bounded_affine_synthesis', op: input.op, rule,
    observations: samples.map(row => row.runId) });
  next.procedures[input.op] = { ...program, modelSourceRef: null, source: { kind: 'bounded_affine_synthesis', ref } };
  next.proposals.push({ op: input.op, proposal: rule, accepted: true, support: samples.length,
    sourceRef: ref, sourceKind: 'bounded_affine_synthesis' });
  return next;
}

function observe(state, input, verifierDigest) {
  const next = base.observe(state, input, verifierDigest);
  for (const [op, program] of Object.entries(next.procedures)) {
    if (state.procedures[op]?.source) program.source = state.procedures[op].source;
  }
  return next;
}

module.exports = { ...base, consider, observe, synthesize };
