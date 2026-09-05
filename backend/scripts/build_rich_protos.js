/**
 * Builds rich, validated Protobuf definition files for all GenOS gRPC services.
 */

const fs = require('fs');
const path = require('path');
const protoLoader = require('@grpc/proto-loader');

const PROTO_DIR = path.resolve(__dirname, '../proto');
if (!fs.existsSync(PROTO_DIR)) {
  fs.mkdirSync(PROTO_DIR, { recursive: true });
}

// Map of service names to their full Protobuf definition content
const PROTO_DEFINITIONS = {
  arena: `syntax = "proto3";
package genos.arena;

service ArenaService {
  rpc Ping (Empty) returns (PingResponse);
  rpc RunTournament (TournamentRequest) returns (TournamentResponse);
  rpc CalculatePareto (ParetoRequest) returns (ParetoResponse);
  rpc GetLeaderboard (Empty) returns (LeaderboardResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message TournamentRequest { string problem_id = 1; string problem_spec_json = 2; }
message TournamentResponse { bool success = 1; string winner = 2; string leaderboard_json = 3; }
message ParetoRequest { string candidates_json = 1; }
message ParetoResponse { int32 pareto_count = 1; string pareto_front_json = 2; string knee_point_json = 3; }
message LeaderboardResponse { repeated SolverRank solvers = 1; }
message SolverRank { string key = 1; string name = 2; int32 elo = 3; }
`,

  auth: `syntax = "proto3";
package genos.auth;

service AuthService {
  rpc Ping (Empty) returns (PingResponse);
  rpc Authenticate (AuthRequest) returns (AuthResponse);
  rpc ValidateToken (TokenRequest) returns (TokenResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message AuthRequest { string username = 1; string password = 2; }
message AuthResponse { bool authenticated = 1; string token = 2; string role = 3; }
message TokenRequest { string token = 1; }
message TokenResponse { bool valid = 1; string user_id = 2; string role = 3; }
`,

  command: `syntax = "proto3";
package genos.command;

service CommandService {
  rpc Ping (Empty) returns (PingResponse);
  rpc ExecuteCommand (CommandRequest) returns (CommandResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message CommandRequest { string command = 1; repeated string args = 2; }
message CommandResponse { int32 exit_code = 1; string stdout = 2; string stderr = 3; }
`,

  compliance: `syntax = "proto3";
package genos.compliance;

service ComplianceService {
  rpc Ping (Empty) returns (PingResponse);
  rpc CheckCompliance (ComplianceRequest) returns (ComplianceResponse);
  rpc GetAuditReport (Empty) returns (AuditReportResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message ComplianceRequest { string workspace_id = 1; string rule_id = 2; }
message ComplianceResponse { bool compliant = 1; repeated string violations = 2; }
message AuditReportResponse { string report_json = 1; int32 total_checks = 2; }
`,

  config: `syntax = "proto3";
package genos.config;

service ConfigService {
  rpc Ping (Empty) returns (PingResponse);
  rpc GetConfig (Empty) returns (ConfigResponse);
  rpc UpdateConfig (UpdateConfigRequest) returns (ConfigResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message ConfigResponse { string config_json = 1; }
message UpdateConfigRequest { string key = 1; string value_json = 2; }
`,

  controlPlane: `syntax = "proto3";
package genos.controlPlane;

service ControlPlaneService {
  rpc Ping (Empty) returns (PingResponse);
  rpc GetCircuitStatus (Empty) returns (CircuitStatusResponse);
  rpc TripCircuit (TripCircuitRequest) returns (CircuitStatusResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message CircuitStatusResponse { bool is_open = 1; int32 failures = 2; string state = 3; }
message TripCircuitRequest { string circuit_name = 1; string reason = 2; }
`,

  deploy: `syntax = "proto3";
package genos.deploy;

service DeployService {
  rpc Ping (Empty) returns (PingResponse);
  rpc DeployArtifact (DeployRequest) returns (DeployResponse);
  rpc GetDeploymentStatus (DeployStatusRequest) returns (DeployResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message DeployRequest { string target = 1; string artifact_path = 2; }
message DeployStatusRequest { string deployment_id = 1; }
message DeployResponse { string deployment_id = 1; string status = 2; string endpoint_url = 3; }
`,

  eval: `syntax = "proto3";
package genos.eval;

service EvalService {
  rpc Ping (Empty) returns (PingResponse);
  rpc EvaluateMetric (EvalMetricRequest) returns (EvalMetricResponse);
  rpc GetSummary (Empty) returns (EvalSummaryResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message EvalMetricRequest { string metric_name = 1; repeated float values = 2; }
message EvalMetricResponse { float score = 1; string evaluation = 2; }
message EvalSummaryResponse { string summary_json = 1; }
`,

  evaluation: `syntax = "proto3";
package genos.evaluation;

service EvaluationService {
  rpc Ping (Empty) returns (PingResponse);
  rpc EvaluateDossier (DossierRequest) returns (DossierResponse);
  rpc CalculateParetoFront (ParetoEvalRequest) returns (ParetoEvalResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message DossierRequest { string worker_id = 1; string evidence_report_json = 2; }
message DossierResponse { float fitness_score = 1; float pass_rate = 2; int32 claims = 3; }
message ParetoEvalRequest { repeated string dossiers_json = 1; }
message ParetoEvalResponse { int32 pareto_count = 1; string knee_candidate_id = 2; string leaderboard_json = 3; }
`,

  experiment: `syntax = "proto3";
package genos.experiment;

service ExperimentService {
  rpc Ping (Empty) returns (PingResponse);
  rpc RunExperiment (ExperimentRequest) returns (ExperimentResponse);
  rpc GetExperimentStatus (ExperimentIdRequest) returns (ExperimentResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message ExperimentRequest { string name = 1; string config_json = 2; }
message ExperimentIdRequest { string experiment_id = 1; }
message ExperimentResponse { string experiment_id = 1; string status = 2; string result_json = 3; }
`,

  framework: `syntax = "proto3";
package genos.framework;

service FrameworkService {
  rpc Ping (Empty) returns (PingResponse);
  rpc RunFramework (FrameworkRunRequest) returns (FrameworkRunResponse);
  rpc ListFrameworks (Empty) returns (FrameworkListResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message FrameworkRunRequest { string framework = 1; string task = 2; }
message FrameworkRunResponse { bool success = 1; string output = 2; }
message FrameworkListResponse { repeated string frameworks = 1; }
`,

  ide: `syntax = "proto3";
package genos.ide;

service IdeService {
  rpc Ping (Empty) returns (PingResponse);
  rpc ExecuteVfsOperation (VfsOperationRequest) returns (VfsOperationResponse);
  rpc InspectVfs (VfsInspectRequest) returns (VfsInspectResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message VfsOperationRequest { string op = 1; string file_path = 2; string content = 3; }
message VfsOperationResponse { bool success = 1; string message = 2; }
message VfsInspectRequest { string dir_path = 1; }
message VfsInspectResponse { repeated string entries = 1; }
`,

  incident: `syntax = "proto3";
package genos.incident;

service IncidentService {
  rpc Ping (Empty) returns (PingResponse);
  rpc ReportIncident (IncidentReportRequest) returns (IncidentResponse);
  rpc GetIncidentHistory (Empty) returns (IncidentHistoryResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message IncidentReportRequest { string agent_id = 1; string reason = 2; string details_json = 3; }
message IncidentResponse { string incident_id = 1; string status = 2; }
message IncidentHistoryResponse { string history_json = 1; int32 count = 2; }
`,

  integration: `syntax = "proto3";
package genos.integration;

service IntegrationService {
  rpc Ping (Empty) returns (PingResponse);
  rpc TriggerIntegration (IntegrationRequest) returns (IntegrationResponse);
  rpc ListIntegrations (Empty) returns (IntegrationListResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message IntegrationRequest { string integration_id = 1; string payload_json = 2; }
message IntegrationResponse { bool success = 1; string result = 2; }
message IntegrationListResponse { repeated string integrations = 1; }
`,

  lineage: `syntax = "proto3";
package genos.lineage;

service LineageService {
  rpc Ping (Empty) returns (PingResponse);
  rpc GetPhylogeny (Empty) returns (PhylogenyResponse);
  rpc RecordLineage (RecordLineageRequest) returns (RecordLineageResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message PhylogenyResponse { string nodes_json = 1; string edges_json = 2; int32 node_count = 3; }
message RecordLineageRequest { string agent_id = 1; string parent_id = 2; string role = 3; float score = 4; }
message RecordLineageResponse { bool success = 1; }
`,

  mcp: `syntax = "proto3";
package genos.mcp;

service McpService {
  rpc Ping (Empty) returns (PingResponse);
  rpc ListTools (Empty) returns (ToolsListResponse);
  rpc CallTool (ToolCallRequest) returns (ToolCallResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message ToolsListResponse { repeated ToolDef tools = 1; }
message ToolDef { string name = 1; string description = 2; string schema_json = 3; }
message ToolCallRequest { string tool_name = 1; string arguments_json = 2; }
message ToolCallResponse { bool success = 1; string content_json = 2; string error = 3; }
`,

  platform: `syntax = "proto3";
package genos.platform;

service PlatformService {
  rpc Ping (Empty) returns (PingResponse);
  rpc CheckSafety (SafetyCheckRequest) returns (SafetyCheckResponse);
  rpc GetSafetyStatus (Empty) returns (SafetyStatusResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message SafetyCheckRequest { string action = 1; string target = 2; }
message SafetyCheckResponse { bool allowed = 1; string reason = 2; }
message SafetyStatusResponse { string status = 1; int32 blocked_count = 2; }
`,

  plugin: `syntax = "proto3";
package genos.plugin;

service PluginService {
  rpc Ping (Empty) returns (PingResponse);
  rpc ExecutePlugin (PluginRequest) returns (PluginResponse);
  rpc ListPlugins (Empty) returns (PluginListResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message PluginRequest { string plugin_id = 1; string input_json = 2; }
message PluginResponse { bool success = 1; string output_json = 2; }
message PluginListResponse { repeated string plugins = 1; }
`,

  productProof: `syntax = "proto3";
package genos.productProof;

service ProductProofService {
  rpc Ping (Empty) returns (PingResponse);
  rpc GenerateProof (ProofRequest) returns (ProofResponse);
  rpc VerifyProof (ProofVerifyRequest) returns (ProofVerifyResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message ProofRequest { string feature_id = 1; string execution_id = 2; }
message ProofResponse { string proof_hash = 1; string claims_json = 2; }
message ProofVerifyRequest { string proof_hash = 1; }
message ProofVerifyResponse { bool verified = 1; string explanation = 2; }
`,

  prompt: `syntax = "proto3";
package genos.prompt;

service PromptService {
  rpc Ping (Empty) returns (PingResponse);
  rpc EvaluatePromptDrift (DriftRequest) returns (DriftResponse);
  rpc GetPromptTemplate (PromptTemplateRequest) returns (PromptTemplateResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message DriftRequest { string base_prompt = 1; string current_prompt = 2; }
message DriftResponse { float levenshtein_ratio = 1; string drift_status = 2; }
message PromptTemplateRequest { string role = 1; }
message PromptTemplateResponse { string template = 1; }
`,

  rag: `syntax = "proto3";
package genos.rag;

service RagService {
  rpc Ping (Empty) returns (PingResponse);
  rpc QueryGraphRag (RagQueryRequest) returns (RagQueryResponse);
  rpc IngestDocument (RagIngestRequest) returns (RagIngestResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message RagQueryRequest { string query = 1; int32 limit = 2; }
message RagQueryResponse { repeated string context_nodes = 1; string synthesis = 2; }
message RagIngestRequest { string doc_id = 1; string text = 2; }
message RagIngestResponse { bool success = 1; int32 entities_extracted = 2; }
`,

  registry: `syntax = "proto3";
package genos.registry;

service RegistryService {
  rpc Ping (Empty) returns (PingResponse);
  rpc RegisterWorkspace (RegisterWorkspaceRequest) returns (WorkspaceRegResponse);
  rpc ResolveWorkspace (ResolveWorkspaceRequest) returns (WorkspaceRegResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message RegisterWorkspaceRequest { string workspace_id = 1; string root_path = 2; }
message ResolveWorkspaceRequest { string workspace_id = 1; }
message WorkspaceRegResponse { bool found = 1; string root_path = 2; }
`,

  release: `syntax = "proto3";
package genos.release;

service ReleaseService {
  rpc Ping (Empty) returns (PingResponse);
  rpc CreateSnapshot (CreateSnapshotRequest) returns (SnapshotResponse);
  rpc RollbackSnapshot (RollbackRequest) returns (RollbackResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message CreateSnapshotRequest { string workspace_id = 1; string label = 2; }
message SnapshotResponse { string snapshot_id = 1; string timestamp = 2; }
message RollbackRequest { string snapshot_id = 1; }
message RollbackResponse { bool success = 1; string restored_at = 2; }
`,

  resilience: `syntax = "proto3";
package genos.resilience;

service ResilienceService {
  rpc Ping (Empty) returns (PingResponse);
  rpc TriggerApoptosis (ApoptosisRequest) returns (ApoptosisResponse);
  rpc FreezeState (FreezeRequest) returns (FreezeResponse);
  rpc ThawState (ThawRequest) returns (ThawResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message ApoptosisRequest { string agent_id = 1; string reason = 2; }
message ApoptosisResponse { bool triggered = 1; string autopsy_report_json = 2; }
message FreezeRequest { string agent_id = 1; string state_json = 2; }
message FreezeResponse { string snapshot_id = 1; bool frozen = 2; }
message ThawRequest { string snapshot_id = 1; }
message ThawResponse { string agent_id = 1; string restored_state_json = 2; }
`,

  rustBridge: `syntax = "proto3";
package genos.rustBridge;

service RustBridgeService {
  rpc Ping (Empty) returns (PingResponse);
  rpc InvokeRustCli (RustCliRequest) returns (RustCliResponse);
  rpc CheckBridgeHealth (Empty) returns (BridgeHealthResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message RustCliRequest { string command = 1; repeated string args = 2; }
message RustCliResponse { int32 exit_code = 1; string stdout = 2; string stderr = 3; }
message BridgeHealthResponse { bool healthy = 1; string binary_path = 2; string version = 3; }
`,

  schema: `syntax = "proto3";
package genos.schema;

service SchemaService {
  rpc Ping (Empty) returns (PingResponse);
  rpc ValidateSchema (ValidateSchemaRequest) returns (ValidateSchemaResponse);
  rpc GetSchemaSpec (SchemaSpecRequest) returns (SchemaSpecResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message ValidateSchemaRequest { string schema_name = 1; string data_json = 2; }
message ValidateSchemaResponse { bool valid = 1; repeated string errors = 2; }
message SchemaSpecRequest { string schema_name = 1; }
message SchemaSpecResponse { string json_schema = 1; }
`,

  secret: `syntax = "proto3";
package genos.secret;

service SecretService {
  rpc Ping (Empty) returns (PingResponse);
  rpc GetSecret (SecretRequest) returns (SecretResponse);
  rpc StoreSecret (StoreSecretRequest) returns (SecretResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message SecretRequest { string key = 1; }
message StoreSecretRequest { string key = 1; string value = 2; }
message SecretResponse { bool found = 1; string value = 2; }
`,

  security: `syntax = "proto3";
package genos.security;

service SecurityService {
  rpc Ping (Empty) returns (PingResponse);
  rpc ScanVulnerabilities (ScanRequest) returns (ScanResponse);
  rpc TriggerKillSwitch (KillSwitchRequest) returns (KillSwitchResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message ScanRequest { string target = 1; }
message ScanResponse { int32 threat_count = 1; repeated string threats = 2; }
message KillSwitchRequest { string reason = 1; }
message KillSwitchResponse { bool halted = 1; string timestamp = 2; }
`,

  sso: `syntax = "proto3";
package genos.sso;

service SsoService {
  rpc Ping (Empty) returns (PingResponse);
  rpc VerifyTicket (SsoTicketRequest) returns (SsoTicketResponse);
  rpc GetConfig (Empty) returns (SsoConfigResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message SsoTicketRequest { string ticket = 1; }
message SsoTicketResponse { bool valid = 1; string user_email = 2; }
message SsoConfigResponse { string provider = 1; string issuer = 2; }
`,

  strategy: `syntax = "proto3";
package genos.strategy;

service StrategyService {
  rpc Ping (Empty) returns (PingResponse);
  rpc ExecuteStrategy (StrategyRequest) returns (StrategyResponse);
  rpc GetContract (ContractRequest) returns (ContractResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message StrategyRequest { string strategy_name = 1; string context_json = 2; }
message StrategyResponse { bool success = 1; string output_json = 2; string execution_run_id = 3; }
message ContractRequest { string strategy_name = 1; }
message ContractResponse { string contract_json = 1; }
`,

  swarm: `syntax = "proto3";
package genos.swarm;

service SwarmService {
  rpc Ping (Empty) returns (PingResponse);
  rpc GetSwarmMetrics (Empty) returns (SwarmMetricsResponse);
  rpc GetSwarmTopology (Empty) returns (SwarmTopologyResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message SwarmMetricsResponse { float entropy = 1; float normalized_entropy = 2; string state = 3; int32 agent_count = 4; }
message SwarmTopologyResponse { repeated string node_ids = 1; string topology_json = 2; }
`,

  trace: `syntax = "proto3";
package genos.trace;

service TraceService {
  rpc Ping (Empty) returns (PingResponse);
  rpc ExportTraces (TraceExportRequest) returns (TraceExportResponse);
  rpc GetTraceSpans (TraceSpansRequest) returns (TraceSpansResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message TraceExportRequest { string tournament_id = 1; string format = 2; }
message TraceExportResponse { string trace_id = 1; string spans_json = 2; }
message TraceSpansRequest { string trace_id = 1; }
message TraceSpansResponse { repeated string spans = 1; }
`,

  trajectory: `syntax = "proto3";
package genos.trajectory;

service TrajectoryService {
  rpc Ping (Empty) returns (PingResponse);
  rpc RecordTrajectory (RecordTrajectoryRequest) returns (TrajectoryResponse);
  rpc GetTrajectory (TrajectoryQuery) returns (TrajectoryResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message RecordTrajectoryRequest { string agent_id = 1; string step_action = 2; string detail = 3; }
message TrajectoryQuery { string agent_id = 1; int32 limit = 2; }
message TrajectoryResponse { string agent_id = 1; repeated string steps = 2; }
`,

  webhook: `syntax = "proto3";
package genos.webhook;

service WebhookService {
  rpc Ping (Empty) returns (PingResponse);
  rpc DispatchWebhook (WebhookDispatchRequest) returns (WebhookResponse);
  rpc ListWebhooks (Empty) returns (WebhookListResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message WebhookDispatchRequest { string url = 1; string event = 2; string payload_json = 3; }
message WebhookResponse { bool dispatched = 1; int32 status_code = 2; }
message WebhookListResponse { repeated string webhooks = 1; }
`,

  workflow: `syntax = "proto3";
package genos.workflow;

service WorkflowService {
  rpc Ping (Empty) returns (PingResponse);
  rpc StartWorkflow (StartWorkflowRequest) returns (WorkflowResponse);
  rpc GetWorkflowStatus (WorkflowStatusRequest) returns (WorkflowResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message StartWorkflowRequest { string workflow_name = 1; string initial_data_json = 2; }
message WorkflowStatusRequest { string workflow_id = 1; }
message WorkflowResponse { string workflow_id = 1; string status = 2; string output_json = 3; }
`,

  // Core domain services
  memory: `syntax = "proto3";
package genos.memory.v1;

service MemoryService {
  rpc Ping (Empty) returns (PingResponse);
  rpc StoreMemory (MemoryEntry) returns (StoreResponse);
  rpc SearchMemory (SearchQuery) returns (SearchResponse);
  rpc CherryPickGoldenPath (CherryPickRequest) returns (CherryPickResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message MemoryEntry { string id = 1; string content = 2; repeated float embedding = 3; }
message SearchQuery { string text = 1; repeated float vector = 2; int32 limit = 3; }
message StoreResponse { bool success = 1; }
message SearchResponse { repeated MemoryEntry results = 1; }
message CherryPickRequest { repeated string turns_json = 1; }
message CherryPickResponse { string golden_path_json = 1; int32 noise_reduction_pct = 2; }
`,

  telemetry: `syntax = "proto3";
package genos.telemetry.v1;

service TelemetryService {
  rpc Ping (Empty) returns (PingResponse);
  rpc EmitEvent (AgentEvent) returns (EmitResponse);
  rpc GetSwarmMetrics (Empty) returns (TelemetryMetricsResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message AgentEvent {
  string agent_id = 1;
  string event_type = 2;
  string action = 3;
  string detail = 4;
  string severity = 5;
  string status = 6;
  string payload_json = 7;
}
message EmitResponse { bool success = 1; }
message TelemetryMetricsResponse { float entropy = 1; string state = 2; }
`,

  workspace: `syntax = "proto3";
package genos.workspace.v1;

service WorkspaceService {
  rpc Ping (Empty) returns (PingResponse);
  rpc ProvisionWorkspace (ProvisionRequest) returns (ProvisionResponse);
  rpc CleanWorkspace (CleanRequest) returns (CleanResponse);
  rpc GetDiff (WorkspaceDiffRequest) returns (WorkspaceDiffResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message ProvisionRequest { string workspace_id = 1; string isolation_mode = 2; }
message ProvisionResponse { string workspace_root = 1; }
message CleanRequest { string workspace_id = 1; }
message CleanResponse { bool success = 1; }
message WorkspaceDiffRequest { string workspace_id = 1; string base_ref = 2; string target_ref = 3; }
message WorkspaceDiffResponse { string diff_text = 1; int32 files_changed = 2; }
`,

  agent: `syntax = "proto3";
package genos.agent.v1;

service AgentService {
  rpc Ping (Empty) returns (PingResponse);
  rpc StartMission (AgentMission) returns (MissionResponse);
  rpc StopMission (AgentId) returns (StatusResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message AgentMission {
  string agent_id = 1;
  string name = 2;
  string role = 3;
  string prompt = 4;
  string model_tier = 5;
  string workspace_root = 6;
  string workspace_isolation = 7;
  string agent_type = 8;
  string execution_mode = 9;
  string strategy_contract_json = 10;
  string orchestrator_agent_id = 11;
  string autonomy_plan_json = 12;
  string tool_lease_json = 13;
  string genos_capsule_json = 14;
  string execution_policy_json = 15;
  string execution_budget_json = 16;
  string name_meaning = 20;
}
message AgentId { string id = 1; }
message MissionResponse { bool success = 1; string message = 2; }
message StatusResponse { bool stopped = 1; string status = 2; }
`,

  orchestrator: `syntax = "proto3";
package genos.orchestrator.v1;

service OrchestratorService {
  rpc Ping (Empty) returns (PingResponse);
  rpc DispatchWorker (WorkerRequest) returns (WorkerResponse);
}

message Empty {}
message PingResponse { string status = 1; }
message WorkerRequest { string orchestrator_id = 1; string worker_id = 2; string prompt = 3; }
message WorkerResponse { bool success = 1; string status = 2; int32 garage_slot = 3; }
`,

  core: `syntax = "proto3";
package genos.core.v1;

service CoreService {
  rpc Ping (Empty) returns (StatusResponse);
  rpc GetSystemHealth (Empty) returns (HealthResponse);
}

message Empty {}
message StatusResponse { string status = 1; }
message HealthResponse { bool healthy = 1; string uptime = 2; }
`
};

// Write each proto file and validate with protoLoader
let count = 0;
for (const [name, content] of Object.entries(PROTO_DEFINITIONS)) {
  const filePath = path.join(PROTO_DIR, `${name}.proto`);
  fs.writeFileSync(filePath, content, 'utf8');
  try {
    protoLoader.loadSync(filePath, { keepCase: true });
    count++;
  } catch (err) {
    console.error(`Validation failed for ${name}.proto:`, err.message);
    process.exit(1);
  }
}

console.log(`Successfully generated and validated ${count} rich .proto files in ${PROTO_DIR}`);
