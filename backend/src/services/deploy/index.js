const agentDeploy = require('./agentDeploy.service');
const trinityDeploy = require('./trinityDeploy.service');

module.exports = {
  ...agentDeploy,
  ...trinityDeploy,
  agentDeploy,
  trinityDeploy
};

