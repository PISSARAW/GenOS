'use strict';

function anchors(samples) {
  const selected = [...samples].sort((a, b) => Math.abs(a.x) - Math.abs(b.x)).slice(0, 3);
  const latest = samples.at(-1);
  if (latest && !selected.some(row => row.x === latest.x)) selected.push(latest);
  return selected;
}

function rejection(state, op) {
  const previous = state.proposals.filter(row => row.op === op && !row.accepted && row.proposal).at(-1);
  if (!previous) return null;
  const samples = state.observations[op] || [];
  const witness = anchors(samples).find(row => previous.proposal.a * row.x + previous.proposal.b !== row.y);
  if (!witness) return null;
  return { proposal: previous.proposal, x: witness.x, observed: witness.y,
    predicted: previous.proposal.a * witness.x + previous.proposal.b, evidenceRef: witness.runId };
}

function build(state, op) {
  const samples = state.observations[op] || [];
  const evidence = anchors(samples).map(row => `x=${row.x}, y=${row.y}`).join('; ');
  const rejected = rejection(state, op);
  const correction = rejected ? `Previous proposal a=${rejected.proposal.a}, b=${rejected.proposal.b} was rejected: `
    + `at x=${rejected.x} it predicted ${rejected.predicted}, but verified y=${rejected.observed}. Repair this error.` : '';
  return { text: `Operator ${op}. Verified anchor measurements: ${evidence || 'none'}. `
    + `All ${samples.length} observations will be checked independently. ${correction} `
    + 'For y=a*x+b, a measurement at x=0 directly gives b; two distinct inputs determine a. Return numeric a,b.',
  evidenceCount: samples.length, anchorRefs: anchors(samples).map(row => row.runId), rejection: rejected };
}

module.exports = { anchors, rejection, build };
