'use strict';

const aTeamDispatch = require('../aTeamDispatchService.js');
const { ensureParent } = require('./parentEnsurer.cjs');
const { buildNCEEnrichments } = require('./nceEnrichmentBuilder.cjs');
const { launchWorker } = require('./workerLauncher.cjs');

async function handleTeam(db, context) {
  const parent = await ensureParent({ db, context });
  context.nceEnrichments = await buildNCEEnrichments(context, 'team');
  const result = await aTeamDispatch.dispatchTeam({ db, context, parent, launchWorker });
  process.stdout.write(JSON.stringify(result));
}

module.exports = { handleTeam };