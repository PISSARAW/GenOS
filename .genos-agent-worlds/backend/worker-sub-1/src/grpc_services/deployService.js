const agentDeploy = require('../services/deploy/agentDeploy.service');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Deploy is alive via gRPC!" }),

  DeployArtifact: async (call, callback) => {
    try {
      const { target } = call.request || {};
      const deploymentId = `dep-${Date.now()}`;
      callback(null, {
        deployment_id: deploymentId,
        status: 'deployed',
        endpoint_url: `http://localhost:4000/deploy/${target || 'default'}`
      });
    } catch (err) {
      callback(null, { deployment_id: '', status: 'failed', endpoint_url: '' });
    }
  },

  GetDeploymentStatus: (call, callback) => {
    callback(null, {
      deployment_id: call.request?.deployment_id || 'dep-1',
      status: 'healthy',
      endpoint_url: 'http://localhost:4000'
    });
  }
};
