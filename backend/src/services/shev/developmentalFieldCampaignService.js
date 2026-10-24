'use strict';

const runner = require('./developmentalCampaignRunner');
const { createFieldAdapter, createProtocolAdapter } = require('./developmentalFieldCampaignAdapter');

function createCampaign(input) {
  const manifest = input?.manifest;
  const campaignAdapter = manifest?.mode === 'protocol' ? createProtocolAdapter(input)
    : createFieldAdapter(input);
  let preparation;
  async function prepare() {
    preparation = await campaignAdapter.prepare();
    return preparation;
  }
  async function tick() {
    if (!preparation) await prepare();
    return runner.runCampaign({ db: input.db, manifest: campaignAdapter.manifest,
      runWindow: campaignAdapter.runWindow, verifyWindow: campaignAdapter.verifyWindow });
  }
  return Object.freeze({ manifest: campaignAdapter.manifest, prepare, tick });
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
