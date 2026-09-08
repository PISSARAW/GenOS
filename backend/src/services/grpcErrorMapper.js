const grpc = require('@grpc/grpc-js');

function grpcStatusForError(error = {}) {
  if (Number.isInteger(error.code)) return error.code;
  const code = String(error.code || error.status || '').toUpperCase();
  if (['INVALID_ARGUMENT', 'BAD_REQUEST', 'INVALID_TOOL', 'INVALID_MISSION_JSON'].includes(code)) return grpc.status.INVALID_ARGUMENT;
  if (['NOT_FOUND', 'WORKFLOW_NOT_FOUND', 'RESOURCE_NOT_FOUND', 'AGENT_NOT_FOUND', 'WORKSPACE_NOT_FOUND', 'TOOL_NOT_FOUND', 'MCP_TOOL_NOT_FOUND', 'NOT_FOUND'].includes(code)) return grpc.status.NOT_FOUND;
  if (['UNAUTHENTICATED', 'AUTHENTICATION_REQUIRED'].includes(code)) return grpc.status.UNAUTHENTICATED;
  if (['PERMISSION_DENIED', 'FORBIDDEN', 'ZERO_TRUST_DENIED', 'AGENT_ID_FORBIDDEN', 'INVALID_MISSION_SCOPE'].includes(code)) return grpc.status.PERMISSION_DENIED;
  if (['ALREADY_EXISTS'].includes(code)) return grpc.status.ALREADY_EXISTS;
  if (['RESOURCE_EXHAUSTED'].includes(code)) return grpc.status.RESOURCE_EXHAUSTED;
  if (['DEADLINE_EXCEEDED', 'TIMEOUT'].includes(code)) return grpc.status.DEADLINE_EXCEEDED;
  if (['UNAVAILABLE', 'SERVICE_UNAVAILABLE', 'TOOL_LOCKED', 'BLOCKED', 'CIRCUIT_OPEN', 'FAILED'].includes(code)) return grpc.status.UNAVAILABLE;
  if (['FAILED_PRECONDITION'].includes(code)) return grpc.status.FAILED_PRECONDITION;
  return grpc.status.INTERNAL;
}

module.exports = { grpcStatusForError };
