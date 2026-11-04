'use strict';
const fs = require('node:fs');
const path = require('node:path');
const io = require('../deceptive-patch-bench/io.cjs');
const prepare = require('./prepare.cjs');

async function run(directory) {
  const campaign = prepare.verify(directory);
  prepare.verifyRuntime();
  fs.mkdirSync(path.join(directory, 'tmp'), {recursive: true});
  for (const trial of campaign.runs) {
    const outcome = path.join(directory, 'outcomes', trial.id + '.json');
    if (fs.existsSync(outcome)) continue;
    if (fs.existsSync(path.join(directory, 'started', trial.id + '.json'))) {
      io.write(outcome, {...trial, interrupted: true, reason: 'previous_start_without_terminal_outcome_never_replayed'});
      continue;
    }
    const result = await require('./trial-process.cjs').execute(directory, trial);
    console.log(JSON.stringify({sequence: trial.sequence, id: trial.id, exitCode: result.exitCode, timedOut: result.timedOut}));
  }
  prepare.verifyRuntime();
  io.write(path.join(directory, 'campaign-completion.json'), {finishedAt: new Date().toISOString(),
    trials: campaign.runs.length, runtimeVerifiedAfterCampaign: true});
}
run(path.resolve(process.argv[2])).catch(error => {console.error(error); process.exitCode = 1;});
