'use strict';

const { performance } = require('perf_hooks');
const { calculateCapacity } = require('../src/services/metapopulation/observability/regionalUtilityService');
const { planAntiSynchrony } = require('../src/services/metapopulation/observability/antiSynchronyService');

function buildScenario(size) {
  const demes = Array.from({ length: size }, (_, index) => ({ demeId: `deme-${index}`,
    status: 'ACTIVE', quality: 0.75, localStrategies: [`strategy-${index % 5}`], capabilities: [`cap-${index % 7}`] }));
  const corridors = demes.flatMap((deme, index) => {
    const target = demes[(index + 1) % size];
    return [{ sourceDemeId: deme.demeId, targetDemeId: target.demeId, enabled: true, weight: 0.7, compatibility: 0.8 },
      { sourceDemeId: target.demeId, targetDemeId: deme.demeId, enabled: true, weight: 0.7, compatibility: 0.8 }];
  });
  const observations = Object.fromEntries(demes.map((deme, index) => [deme.demeId,
    { errors: Array.from({ length: 24 }, (_, tick) => Math.sin((tick + index % 3) / 4)) }]));
  return { demes, corridors, observations };
}

function measure(operation, repeats, summarize) {
  const samples = [];
  let result;
  for (let index = 0; index < repeats; index += 1) {
    const start = performance.now();
    result = operation();
    samples.push(performance.now() - start);
  }
  return { medianMs: Number(median(samples).toFixed(3)), samples: repeats, result: summarize(result) };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function runBenchmark(options = {}) {
  const sizes = options.sizes || [12, 24, 48];
  const repeats = Number.isSafeInteger(options.repeats) ? Math.max(1, Math.min(100, options.repeats)) : 7;
  return { benchmark: 'metapopulation-regional-observability-v1', node: process.version, repeats,
    scenarios: sizes.map((size) => benchmarkScenario(size, repeats)) };
}

function benchmarkScenario(size, repeats) {
  const input = buildScenario(size);
  return { demeCount: size, corridorCount: input.corridors.length,
    capacity: measure(() => calculateCapacity(input.demes, input.corridors), repeats, summarizeCapacity),
    synchrony: measure(() => planAntiSynchrony({ demes: input.demes, observations: input.observations }), repeats, summarizeSynchrony) };
}

function summarizeCapacity(result) { return { value: result.value, iterations: result.iterations, converged: result.converged }; }
function summarizeSynchrony(result) { return { affectedPairCount: result.affectedPairs.length,
  protectedDemeCount: result.protectedDemeIds.length, action: result.policy.action }; }

function main() {
  const report = runBenchmark({ repeats: Number(process.argv[2]) });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) main();
module.exports = { runBenchmark, buildScenario };
