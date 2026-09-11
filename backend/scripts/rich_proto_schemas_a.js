'use strict';

module.exports = {
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
`
};
