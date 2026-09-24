'use strict';

const crypto = require('crypto');

function stablePayload(prebrief) {
  return {
    schema: prebrief.schema,
    goal: prebrief.goal,
    successCriteria: prebrief.successCriteria,
    organization: prebrief.organization,
    members: prebrief.members
  };
}

function sealTeamContract(prebrief) {
  const payload = stablePayload(prebrief);
  const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return { ...payload, version: 1, contractHash: hash };
}

module.exports = { sealTeamContract };
