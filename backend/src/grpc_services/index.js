// Auto-generated gRPC Services Loader
module.exports = function registerAllServices(grpcServer, protoDescriptor) {
  if (protoDescriptor.genos.arena && protoDescriptor.genos.arena.ArenaService) {
    grpcServer.addService(protoDescriptor.genos.arena.ArenaService.service, require('./arenaService'));
  }
  if (protoDescriptor.genos.auth && protoDescriptor.genos.auth.AuthService) {
    grpcServer.addService(protoDescriptor.genos.auth.AuthService.service, require('./authService'));
  }
  if (protoDescriptor.genos.command && protoDescriptor.genos.command.CommandService) {
    grpcServer.addService(protoDescriptor.genos.command.CommandService.service, require('./commandService'));
  }
  if (protoDescriptor.genos.compliance && protoDescriptor.genos.compliance.ComplianceService) {
    grpcServer.addService(protoDescriptor.genos.compliance.ComplianceService.service, require('./complianceService'));
  }
  if (protoDescriptor.genos.config && protoDescriptor.genos.config.ConfigService) {
    grpcServer.addService(protoDescriptor.genos.config.ConfigService.service, require('./configService'));
  }
  if (protoDescriptor.genos.controlPlane && protoDescriptor.genos.controlPlane.ControlPlaneService) {
    grpcServer.addService(protoDescriptor.genos.controlPlane.ControlPlaneService.service, require('./controlPlaneService'));
  }
  if (protoDescriptor.genos.deploy && protoDescriptor.genos.deploy.DeployService) {
    grpcServer.addService(protoDescriptor.genos.deploy.DeployService.service, require('./deployService'));
  }
  if (protoDescriptor.genos.eval && protoDescriptor.genos.eval.EvalService) {
    grpcServer.addService(protoDescriptor.genos.eval.EvalService.service, require('./evalService'));
  }
  if (protoDescriptor.genos.evaluation && protoDescriptor.genos.evaluation.EvaluationService) {
    grpcServer.addService(protoDescriptor.genos.evaluation.EvaluationService.service, require('./evaluationService'));
  }
  if (protoDescriptor.genos.experiment && protoDescriptor.genos.experiment.ExperimentService) {
    grpcServer.addService(protoDescriptor.genos.experiment.ExperimentService.service, require('./experimentService'));
  }
  if (protoDescriptor.genos.framework && protoDescriptor.genos.framework.FrameworkService) {
    grpcServer.addService(protoDescriptor.genos.framework.FrameworkService.service, require('./frameworkService'));
  }
  if (protoDescriptor.genos.ide && protoDescriptor.genos.ide.IdeService) {
    grpcServer.addService(protoDescriptor.genos.ide.IdeService.service, require('./ideService'));
  }
  if (protoDescriptor.genos.incident && protoDescriptor.genos.incident.IncidentService) {
    grpcServer.addService(protoDescriptor.genos.incident.IncidentService.service, require('./incidentService'));
  }
  if (protoDescriptor.genos.integration && protoDescriptor.genos.integration.IntegrationService) {
    grpcServer.addService(protoDescriptor.genos.integration.IntegrationService.service, require('./integrationService'));
  }
  if (protoDescriptor.genos.lineage && protoDescriptor.genos.lineage.LineageService) {
    grpcServer.addService(protoDescriptor.genos.lineage.LineageService.service, require('./lineageService'));
  }
  if (protoDescriptor.genos.mcp && protoDescriptor.genos.mcp.McpService) {
    grpcServer.addService(protoDescriptor.genos.mcp.McpService.service, require('./mcpService'));
  }
  if (protoDescriptor.genos.memory && protoDescriptor.genos.memory.MemoryService) {
    grpcServer.addService(protoDescriptor.genos.memory.MemoryService.service, require('./memoryService'));
  }
  if (protoDescriptor.genos.platform && protoDescriptor.genos.platform.PlatformService) {
    grpcServer.addService(protoDescriptor.genos.platform.PlatformService.service, require('./platformService'));
  }
  if (protoDescriptor.genos.plugin && protoDescriptor.genos.plugin.PluginService) {
    grpcServer.addService(protoDescriptor.genos.plugin.PluginService.service, require('./pluginService'));
  }
  if (protoDescriptor.genos.productProof && protoDescriptor.genos.productProof.ProductProofService) {
    grpcServer.addService(protoDescriptor.genos.productProof.ProductProofService.service, require('./productProofService'));
  }
  if (protoDescriptor.genos.prompt && protoDescriptor.genos.prompt.PromptService) {
    grpcServer.addService(protoDescriptor.genos.prompt.PromptService.service, require('./promptService'));
  }
  if (protoDescriptor.genos.rag && protoDescriptor.genos.rag.RagService) {
    grpcServer.addService(protoDescriptor.genos.rag.RagService.service, require('./ragService'));
  }
  if (protoDescriptor.genos.registry && protoDescriptor.genos.registry.RegistryService) {
    grpcServer.addService(protoDescriptor.genos.registry.RegistryService.service, require('./registryService'));
  }
  if (protoDescriptor.genos.release && protoDescriptor.genos.release.ReleaseService) {
    grpcServer.addService(protoDescriptor.genos.release.ReleaseService.service, require('./releaseService'));
  }
  if (protoDescriptor.genos.resilience && protoDescriptor.genos.resilience.ResilienceService) {
    grpcServer.addService(protoDescriptor.genos.resilience.ResilienceService.service, require('./resilienceService'));
  }
  if (protoDescriptor.genos.rustBridge && protoDescriptor.genos.rustBridge.RustBridgeService) {
    grpcServer.addService(protoDescriptor.genos.rustBridge.RustBridgeService.service, require('./rustBridgeService'));
  }
  if (protoDescriptor.genos.schema && protoDescriptor.genos.schema.SchemaService) {
    grpcServer.addService(protoDescriptor.genos.schema.SchemaService.service, require('./schemaService'));
  }
  if (protoDescriptor.genos.secret && protoDescriptor.genos.secret.SecretService) {
    grpcServer.addService(protoDescriptor.genos.secret.SecretService.service, require('./secretService'));
  }
  if (protoDescriptor.genos.security && protoDescriptor.genos.security.SecurityService) {
    grpcServer.addService(protoDescriptor.genos.security.SecurityService.service, require('./securityService'));
  }
  if (protoDescriptor.genos.sso && protoDescriptor.genos.sso.SsoService) {
    grpcServer.addService(protoDescriptor.genos.sso.SsoService.service, require('./ssoService'));
  }
  if (protoDescriptor.genos.strategy && protoDescriptor.genos.strategy.StrategyService) {
    grpcServer.addService(protoDescriptor.genos.strategy.StrategyService.service, require('./strategyService'));
  }
  if (protoDescriptor.genos.swarm && protoDescriptor.genos.swarm.SwarmService) {
    grpcServer.addService(protoDescriptor.genos.swarm.SwarmService.service, require('./swarmService'));
  }
  if (protoDescriptor.genos.telemetry && protoDescriptor.genos.telemetry.TelemetryService) {
    grpcServer.addService(protoDescriptor.genos.telemetry.TelemetryService.service, require('./telemetryService'));
  }
  if (protoDescriptor.genos.trace && protoDescriptor.genos.trace.TraceService) {
    grpcServer.addService(protoDescriptor.genos.trace.TraceService.service, require('./traceService'));
  }
  if (protoDescriptor.genos.trajectory && protoDescriptor.genos.trajectory.TrajectoryService) {
    grpcServer.addService(protoDescriptor.genos.trajectory.TrajectoryService.service, require('./trajectoryService'));
  }
  if (protoDescriptor.genos.webhook && protoDescriptor.genos.webhook.WebhookService) {
    grpcServer.addService(protoDescriptor.genos.webhook.WebhookService.service, require('./webhookService'));
  }
  if (protoDescriptor.genos.workflow && protoDescriptor.genos.workflow.WorkflowService) {
    grpcServer.addService(protoDescriptor.genos.workflow.WorkflowService.service, require('./workflowService'));
  }
  if (protoDescriptor.genos.workspace && protoDescriptor.genos.workspace.WorkspaceService) {
    grpcServer.addService(protoDescriptor.genos.workspace.WorkspaceService.service, require('./workspaceService'));
  }
};
