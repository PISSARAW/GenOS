const grpc = require('@grpc/grpc-js');

function grpcStatusForError(error = {}) {
  if (Number.isInteger(error.code)) return error.code;
  const code = String(error.code || error.status || '').toUpperCase();
  return statusForCode(code);
}

module.exports = { grpcStatusForError };

const STATUS_GROUPS = [
  [['INVALID_ARGUMENT', 'BAD_REQUEST', 'INVALID_TOOL', 'INVALID_MISSION_JSON'], grpc.status.INVALID_ARGUMENT],
  [['NOT_FOUND', 'WORKFLOW_NOT_FOUND', 'RESOURCE_NOT_FOUND', 'AGENT_NOT_FOUND', 'WORKSPACE_NOT_FOUND', 'TOOL_NOT_FOUND', 'MCP_TOOL_NOT_FOUND', 'NOT_FOUND'], grpc.status.NOT_FOUND],
  [['UNAUTHENTICATED', 'AUTHENTICATION_REQUIRED'], grpc.status.UNAUTHENTICATED],
  [['PERMISSION_DENIED', 'FORBIDDEN', 'ZERO_TRUST_DENIED', 'AGENT_ID_FORBIDDEN', 'INVALID_MISSION_SCOPE'], grpc.status.PERMISSION_DENIED],
  [['ALREADY_EXISTS'], grpc.status.ALREADY_EXISTS],
  [['RESOURCE_EXHAUSTED'], grpc.status.RESOURCE_EXHAUSTED],
  [['DEADLINE_EXCEEDED', 'TIMEOUT'], grpc.status.DEADLINE_EXCEEDED],
  [['UNAVAILABLE', 'SERVICE_UNAVAILABLE', 'TOOL_LOCKED', 'BLOCKED', 'CIRCUIT_OPEN', 'FAILED'], grpc.status.UNAVAILABLE],
  [['FAILED_PRECONDITION'], grpc.status.FAILED_PRECONDITION]
];

function statusForCode(code) {
  for (const [codes, status] of STATUS_GROUPS) {
    if (codes.includes(code)) return status;
  }
  return grpc.status.INTERNAL;
}
