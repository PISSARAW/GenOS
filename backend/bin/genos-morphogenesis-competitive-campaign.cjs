#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const evaluator = require('../src/services/morphogenesis/competitiveCampaignEvaluator');

function main() {
  const filename = process.argv[2] || process.env.GENOS_COMPETITIVE_CAMPAIGN_RECEIPT;
  const campaign = filename ? JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8')) : {};
  const result = evaluator.evaluate(campaign);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (filename && result.status === 'not_observed') process.exitCode = 2;
}

try { main(); } catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
