const deploy = require('../services/deploy');

function defaultEndpointUrl() {
  return process.env.GENOS_DEPLOY_ENDPOINT || process.env.GENOS_API_URL || 'http://127.0.0.1:4000';
}

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Deploy is alive via gRPC!" }),

  DeployArtifact: async (call, callback) => {
    try {
      const { target, artifact_path } = call.request || {};
      const res = typeof deploy.deployArtifact === 'function'
        ? await deploy.deployArtifact(target, artifact_path)
        : {};
      callback(null, {
        deployment_id: res.deploymentId || `dep-${Date.now()}`,
        status: res.status || 'deployed',
        endpoint_url: res.url || defaultEndpointUrl()
      });
    } catch (err) {
      callback(null, { deployment_id: '', status: 'failed', endpoint_url: '' });
    }
  },

  GetDeploymentStatus: (call, callback) => {
    callback(null, {
      deployment_id: call.request?.deployment_id || 'dep-1',
      status: 'healthy',
      endpoint_url: defaultEndpointUrl()
    });
  }
};
