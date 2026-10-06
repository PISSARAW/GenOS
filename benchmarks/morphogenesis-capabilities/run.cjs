'use strict';
const { meristemBench, spiralBench, temporalBench } = require('./exploration.cjs');
const { compare } = require('../../backend/src/services/morphogenesis/capabilities/cambiumDecision');
const { anytimePValue } = require('../../backend/src/services/morphogenesis/capabilities/statisticalReceipt');
function generator(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
function memoryBench() {
  const before = { environmentVersion: 'v1', conditions: [{ idempotent: true }],
    counterexamples: [{ rare: true }], procedure: { rules: [{ when: {}, decision: 'RETRY' }] } };
  const samples = Array.from({ length: 100 }, (_, i) => ({ caseId: `event:${i}`,
    environmentVersion: i === 98 ? 'v2' : 'v1', facts: { idempotent: i !== 99, rare: i === 0 } }));
  return ['recency', 'frequency', 'phi-age', 'cambium'].map((policy) => {
    const retained = retainCases(policy, samples);
    const after = policy === 'cambium' ? before : { ...before,
      conditions: retained.some((item) => !item.facts.idempotent) ? before.conditions : [{}],
      counterexamples: retained.some((item) => item.facts.rare) ? before.counterexamples : [] };
    const replay = compare({ before, after, samples });
    return { policy, replayCases: samples.length, changedDecisions: replay.cases.filter((item) => item.before !== item.after).length,
      memoryBudget: 4, retainedCaseIds: retained.map((item) => item.caseId), preserved: replay.preserved };
  });
}
function riskCampaign(random, ratio, winProbability) {
  const delta = 0.05;
  let allocated = 0;
  let promoted = 0;
  for (let test = 0; test < 100; test++) {
    const alpha = delta * (1 - ratio) * ratio ** test;
    allocated += alpha;
    const observations = Array.from({ length: 80 }, () => ({ outcome: random() < winProbability ? 1 : 0 }));
    if (anytimePValue(observations) <= alpha) promoted++;
  }
  return { allocated, promoted };
}
function riskBench() {
  return [0.5, (Math.sqrt(5) - 1) / 2].map((ratio) => {
    let falseCampaigns = 0;
    let detectedCampaigns = 0;
    let maximumAllocated = 0;
    for (let campaign = 0; campaign < 100; campaign++) {
      const nullResult = riskCampaign(generator(42 + campaign), ratio, 0.5);
      const improved = riskCampaign(generator(1042 + campaign), ratio, 0.75);
      if (nullResult.promoted) falseCampaigns++;
      if (improved.promoted) detectedCampaigns++;
      maximumAllocated = Math.max(maximumAllocated, nullResult.allocated);
    }
    return { ratio, delta: 0.05, campaigns: 100, testsPerCampaign: 100, observationsPerTest: 80,
      falseCampaigns, detectedCampaigns, maximumAllocated };
  });
}
function run() {
  return { schemaVersion: 1, simulated: true, seed: 42,
    corpus: 'bounded synthetic mechanisms; no external incident or language-model claims',
    meristem: meristemBench(), spiral: spiralBench(), chronotaxis: temporalBench(generator(42)),
    cambium: memoryBench(), risk: riskBench() };
}
if (require.main === module) console.log(JSON.stringify(run(), null, 2));
module.exports = { run };

function retainCases(policy, samples) {
  if (policy === 'recency') return samples.slice(-4);
  if (policy === 'frequency') return samples.filter((item) => item.facts.idempotent && !item.facts.rare).slice(0, 4);
  if (policy === 'phi-age') return [99, 98, 97, 95].map((index) => samples[index]);
  return [samples[0], samples[98], samples[99], samples[1]];
}
