// Auto-generated gRPC loader
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

module.exports = function loadAllProtos() {
  const services = {};
  services.arena = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'arena.proto'), {keepCase: true}));
  services.auth = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'auth.proto'), {keepCase: true}));
  services.command = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'command.proto'), {keepCase: true}));
  services.compliance = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'compliance.proto'), {keepCase: true}));
  services.config = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'config.proto'), {keepCase: true}));
  services.controlPlane = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'controlPlane.proto'), {keepCase: true}));
  services.deploy = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'deploy.proto'), {keepCase: true}));
  services.eval = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'eval.proto'), {keepCase: true}));
  services.evaluation = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'evaluation.proto'), {keepCase: true}));
  services.experiment = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'experiment.proto'), {keepCase: true}));
  services.framework = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'framework.proto'), {keepCase: true}));
  services.ide = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'ide.proto'), {keepCase: true}));
  services.incident = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'incident.proto'), {keepCase: true}));
  services.integration = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'integration.proto'), {keepCase: true}));
  services.lineage = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'lineage.proto'), {keepCase: true}));
  services.mcp = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'mcp.proto'), {keepCase: true}));
  services.memory = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'memory.proto'), {keepCase: true}));
  services.platform = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'platform.proto'), {keepCase: true}));
  services.plugin = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'plugin.proto'), {keepCase: true}));
  services.productProof = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'productProof.proto'), {keepCase: true}));
  services.prompt = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'prompt.proto'), {keepCase: true}));
  services.rag = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'rag.proto'), {keepCase: true}));
  services.registry = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'registry.proto'), {keepCase: true}));
  services.release = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'release.proto'), {keepCase: true}));
  services.resilience = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'resilience.proto'), {keepCase: true}));
  services.rustBridge = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'rustBridge.proto'), {keepCase: true}));
  services.schema = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'schema.proto'), {keepCase: true}));
  services.secret = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'secret.proto'), {keepCase: true}));
  services.security = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'security.proto'), {keepCase: true}));
  services.sso = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'sso.proto'), {keepCase: true}));
  services.strategy = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'strategy.proto'), {keepCase: true}));
  services.swarm = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'swarm.proto'), {keepCase: true}));
  services.telemetry = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'telemetry.proto'), {keepCase: true}));
  services.trace = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'trace.proto'), {keepCase: true}));
  services.trajectory = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'trajectory.proto'), {keepCase: true}));
  services.webhook = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'webhook.proto'), {keepCase: true}));
  services.workflow = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'workflow.proto'), {keepCase: true}));
  services.workspace = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, 'workspace.proto'), {keepCase: true}));
  return services;
}
