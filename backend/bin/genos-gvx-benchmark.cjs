'use strict';

const provider = require('../src/services/gvxBenchmarkAdapterProvider');
const runner = require('../src/services/gvxBenchmarkRunner');

async function main() {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const campaign = await provider.createConfiguredCampaign(controller.signal);
    const result = await runner.runCampaign(campaign);
    process.stdout.write(`${JSON.stringify({ status: result.status, benchmarkId: result.manifest.benchmarkId,
      runCount: result.runs.length, artifactRef: result.artifactRef })}\n`);
  } catch (error) {
    process.stderr.write(`GVX benchmark failed: ${error.code || 'GVX_BENCHMARK_FAILED'}\n`);
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

main();
