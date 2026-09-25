'use strict';

module.exports = {
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
  rpc GetPhylogeny (LineageScopeRequest) returns (PhylogenyResponse);
  rpc RecordLineage (RecordLineageRequest) returns (RecordLineageResponse);
}

message Empty {}
message LineageScopeRequest { string organization_id = 1; string project_id = 2; string workspace_id = 3; }
message PingResponse { string status = 1; }
message PhylogenyResponse { string nodes_json = 1; string edges_json = 2; int32 node_count = 3; }
message RecordLineageRequest { string agent_id = 1; string parent_id = 2; string role = 3; float score = 4; string organization_id = 5; string project_id = 6; string workspace_id = 7; }
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
`
};
