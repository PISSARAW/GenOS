'use strict';

const path = require('node:path');

try { process.loadEnvFile(path.resolve(__dirname, '../../.env')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

async function main() {
  const manifest = JSON.parse(process.argv[2] || '{}');
  const database = require('../src/db');
  const db = await database.getDatabase();
  try {
    const runner = require('../src/services/syncytium/benchmark/biologicalBenchmarkRunnerService');
    process.stdout.write(JSON.stringify(await runner.runCampaign(manifest, db)));
  } finally {
    await database.closeDatabase();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.code || 'BIOLOGICAL_BENCHMARK_FAILED'}: ${error.message}\n`);
  process.exitCode = 1;
});
