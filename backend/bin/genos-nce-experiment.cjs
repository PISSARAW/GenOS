#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../src/db');
const { generateSplit } = require('../src/services/nceEnvironmentFactory');
const { runCausalCycle } = require('../src/services/nceCausalCycleService');
const { runAblationCampaign } = require('../src/services/nceAblationService');

async function main() {
  const [mode, configPath, reportPath] = process.argv.slice(2);
  if (!['cycle', 'ablation'].includes(mode) || !configPath || !reportPath) {
    throw new Error('Usage: node backend/bin/genos-nce-experiment.cjs cycle|ablation config.json report.json');
  }
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  if (!config.root || !config.databasePath) throw new Error('Explicit root and databasePath required');
  await fs.mkdir(path.resolve(config.root), { recursive: true });
  const db = await getDatabase(path.resolve(config.databasePath));
  try {
    const input = { ...config, root: path.resolve(config.root), db };
    const result = mode === 'ablation' ? await runAblationCampaign(input)
      : await runCausalCycle({ ...input, split: await generateSplit(input) }, db);
    await fs.writeFile(path.resolve(reportPath), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ reportPath: path.resolve(reportPath), evidenceRef: result.evidenceRef,
      measured: result.measured, promoted: result.promoted, meanDelta: result.meanDelta }));
  } finally { await closeDatabase(); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
