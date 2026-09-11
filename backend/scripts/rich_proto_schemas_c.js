'use strict';

module.exports = {
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
