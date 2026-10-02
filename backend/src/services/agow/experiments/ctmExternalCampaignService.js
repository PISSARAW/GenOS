'use strict';

const runner = require('./rivalChallengeRunner');
const benchmarkProtocol = require('./agowBenchmarkProtocolService');
const adapters = {
  mustrad: require('../../../../../benchmarks/rivals/ctm/mustradAdapter.cjs'),
  ur_funny: require('../../../../../benchmarks/rivals/ctm/urFunnyAdapter.cjs'),
  stable_tool_bench: require('../../../../../benchmarks/rivals/ctm/stableToolBenchAdapter.cjs'),
  webarena_lite: require('../../../../../benchmarks/rivals/ctm/webArenaLiteAdapter.cjs')
};

async function run(options) {
  if (options.challenge !== 'ctm') throw new TypeError('CTM external campaign requires the ctm challenge.');
  const adapter = adapters[options.datasetId];
  if (!adapter) throw new TypeError('Unsupported CTM external dataset.');
  const bundle = await adapter.loadCases(options);
  if (options.scenario === 'automation_nonstationary') {
    benchmarkProtocol.validateScenario(options.scenario, bundle.cases);
  }
  const datasetManifest = manifest(bundle);
  return runner.run({ ...options, cases: bundle.cases, datasetManifest });
}

function manifest(bundle) {
  return { datasetId: bundle.datasetId, version: bundle.version, sourceRef: bundle.sourceRef,
    sourceFingerprint: bundle.sourceFingerprint, split: bundle.split, caseCount: bundle.caseCount };
}

module.exports = { run, manifest, adapters };
