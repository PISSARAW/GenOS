'use strict';

const runner = require('./developmentalCampaignRunner');
const { createFieldAdapter } = require('./developmentalFieldCampaignAdapter');

function createCampaign(input) {
  const field = createFieldAdapter(input);
  let preparation;
  async function prepare() {
    preparation = await field.prepare();
    return preparation;
  }
  async function tick() {
    if (!preparation) await prepare();
    return runner.runCampaign({ db: input.db, manifest: field.manifest,
      runWindow: field.runWindow, verifyWindow: field.verifyWindow });
  }
  return Object.freeze({ manifest: field.manifest, prepare, tick });
}

async function prepareCampaign(input) {
  return createCampaign(input).prepare();
}

async function runCampaign(input) {
  const campaign = createCampaign(input);
  await campaign.prepare();
  return campaign.tick();
}

module.exports = { createCampaign, prepareCampaign, runCampaign };
