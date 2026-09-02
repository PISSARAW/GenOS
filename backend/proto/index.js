// Auto-generated gRPC loader
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

module.exports = function loadAllProtos() {
  const services = {};
  services.arena = protoLoader.loadSync(path.join(__dirname, 'arena.proto'), {keepCase: true});
  services.auth = protoLoader.loadSync(path.join(__dirname, 'auth.proto'), {keepCase: true});
  services.command = protoLoader.loadSync(path.join(__dirname, 'command.proto'), {keepCase: true});
  services.compliance = protoLoader.loadSync(path.join(__dirname, 'compliance.proto'), {keepCase: true});
  services.config = protoLoader.loadSync(path.join(__dirname, 'config.proto'), {keepCase: true});
  services.controlPlane = protoLoader.loadSync(path.join(__dirname, 'controlPlane.proto'), {keepCase: true});
  services.deploy = protoLoader.loadSync(path.join(__dirname, 'deploy.proto'), {keepCase: true});
  services.eval = protoLoader.loadSync(path.join(__dirname, 'eval.proto'), {keepCase: true});
  services.evaluation = protoLoader.loadSync(path.join(__dirname, 'evaluation.proto'), {keepCase: true});
  services.experiment = protoLoader.loadSync(path.join(__dirname, 'experiment.proto'), {keepCase: true});
  services.framework = protoLoader.loadSync(path.join(__dirname, 'framework.proto'), {keepCase: true});
  services.ide = protoLoader.loadSync(path.join(__dirname, 'ide.proto'), {keepCase: true});
  services.incident = protoLoader.loadSync(path.join(__dirname, 'incident.proto'), {keepCase: true});
  services.integration = protoLoader.loadSync(path.join(__dirname, 'integration.proto'), {keepCase: true});
  services.lineage = protoLoader.loadSync(path.join(__dirname, 'lineage.proto'), {keepCase: true});
  services.mcp = protoLoader.loadSync(path.join(__dirname, 'mcp.proto'), {keepCase: true});
  services.memory = protoLoader.loadSync(path.join(__dirname, 'memory.proto'), {keepCase: true});
  services.platform = protoLoader.loadSync(path.join(__dirname, 'platform.proto'), {keepCase: true});
  services.plugin = protoLoader.loadSync(path.join(__dirname, 'plugin.proto'), {keepCase: true});
  services.productProof = protoLoader.loadSync(path.join(__dirname, 'productProof.proto'), {keepCase: true});
  services.prompt = protoLoader.loadSync(path.join(__dirname, 'prompt.proto'), {keepCase: true});
  services.rag = protoLoader.loadSync(path.join(__dirname, 'rag.proto'), {keepCase: true});
  services.registry = protoLoader.loadSync(path.join(__dirname, 'registry.proto'), {keepCase: true});
  services.release = protoLoader.loadSync(path.join(__dirname, 'release.proto'), {keepCase: true});
  services.resilience = protoLoader.loadSync(path.join(__dirname, 'resilience.proto'), {keepCase: true});
  services.rustBridge = protoLoader.loadSync(path.join(__dirname, 'rustBridge.proto'), {keepCase: true});
  services.schema = protoLoader.loadSync(path.join(__dirname, 'schema.proto'), {keepCase: true});
  services.secret = protoLoader.loadSync(path.join(__dirname, 'secret.proto'), {keepCase: true});
  services.security = protoLoader.loadSync(path.join(__dirname, 'security.proto'), {keepCase: true});
  services.sso = protoLoader.loadSync(path.join(__dirname, 'sso.proto'), {keepCase: true});
  services.strategy = protoLoader.loadSync(path.join(__dirname, 'strategy.proto'), {keepCase: true});
  services.swarm = protoLoader.loadSync(path.join(__dirname, 'swarm.proto'), {keepCase: true});
  services.telemetry = protoLoader.loadSync(path.join(__dirname, 'telemetry.proto'), {keepCase: true});
  services.trace = protoLoader.loadSync(path.join(__dirname, 'trace.proto'), {keepCase: true});
  services.trajectory = protoLoader.loadSync(path.join(__dirname, 'trajectory.proto'), {keepCase: true});
  services.webhook = protoLoader.loadSync(path.join(__dirname, 'webhook.proto'), {keepCase: true});
  services.workflow = protoLoader.loadSync(path.join(__dirname, 'workflow.proto'), {keepCase: true});
  services.workspace = protoLoader.loadSync(path.join(__dirname, 'workspace.proto'), {keepCase: true});
  return services;
}
