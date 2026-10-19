'use strict';

const contract = require('./developmentalCampaignContract');
const runner = require('./developmentalCampaignRunner');

function createManifest(input) {
  return contract.createManifest(input);
}

async function runCampaign(input) {
  return runner.runCampaign(input);
}

module.exports = { createManifest, runCampaign, FIELD_MINIMUM_MS: contract.FIELD_MINIMUM_MS };
