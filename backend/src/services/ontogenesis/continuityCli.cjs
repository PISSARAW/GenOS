'use strict';

const pairing = require('./pairingService');
const continuity = require('./continuityService');

function required(options, name) {
  if (!options[name]) throw new Error(`--${name} requis`);
  return options[name];
}

function parsedCapabilities(options) {
  if (!options.capabilities) return {};
  return JSON.parse(options.capabilities);
}

async function pairHost(db, options) {
  const result = await pairing.createPairing(db, {
    projectId: required(options, 'project'), role: required(options, 'role'),
    endpoint: required(options, 'endpoint'), capabilities: parsedCapabilities(options)
  });
  console.log(JSON.stringify(result));
}

async function claimHost(db, options) {
  const result = await pairing.claimPairing(db, {
    projectId: required(options, 'project'), code: required(options, 'code')
  });
  console.log(JSON.stringify(result));
}

async function listHosts(db, options) {
  console.log(JSON.stringify(await pairing.listHosts(db, required(options, 'project')), null, 2));
}

async function prepare(db, options) {
  const result = await continuity.prepareHandoff(db, {
    projectId: required(options, 'project'), targetHostId: required(options, 'target-host'),
    sourceHostId: options['source-host'], storeId: options['store-id']
  });
  console.log(JSON.stringify(result));
}

async function accept(db, options) {
  const token = process.env.GENOS_ONTOGENESIS_HANDOFF_TOKEN;
  if (!token) throw new Error('GENOS_ONTOGENESIS_HANDOFF_TOKEN requis');
  const result = await continuity.acceptHandoff(db, {
    projectId: required(options, 'project'), handoffId: required(options, 'handoff'),
    hostId: required(options, 'host'), token
  });
  console.log(JSON.stringify(result));
}

async function status(db, options) {
  console.log(JSON.stringify(await continuity.getContinuity(db, required(options, 'project')), null, 2));
}

async function reclaim(db, options) {
  const result = await continuity.reclaimLocal(db, {
    projectId: required(options, 'project'), hostId: required(options, 'host')
  });
  console.log(JSON.stringify(result));
}

module.exports = {
  'host-pair': pairHost,
  'host-claim': claimHost,
  hosts: listHosts,
  'continuity-prepare': prepare,
  'continuity-accept': accept,
  'continuity-status': status,
  'continuity-reclaim': reclaim
};
