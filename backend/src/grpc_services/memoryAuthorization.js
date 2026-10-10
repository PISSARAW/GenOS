'use strict';
const grpc = require('@grpc/grpc-js');
const { resolveUserFromHeaders } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');

function failure(code, message) { return Object.assign(new Error(message), { code }); }

function requestedScope(request) {
  const organizationId = request.organization_id?.trim();
  const projectId = request.project_id?.trim();
  if (!organizationId || !projectId) throw failure(grpc.status.INVALID_ARGUMENT, 'A complete organization/project scope is required.');
  return { 'x-organization-id': organizationId, 'x-project-id': projectId };
}

async function authorize(call, options = {}) {
  const headers = requestedScope(call.request || {});
  const credentials = call.metadata?.get('x-access-key') || [];
  if (credentials.length !== 1) throw failure(grpc.status.UNAUTHENTICATED, 'One principal credential is required.');
  headers['x-access-key'] = String(credentials[0]);
  const user = await resolveUserFromHeaders(headers);
  if (!user.isAuthenticated) throw failure(grpc.status.UNAUTHENTICATED, 'The principal credential is invalid or revoked.');
  const tenant = await resolveTenant({ headers, user });
  if (!tenant) throw failure(grpc.status.PERMISSION_DENIED, 'The principal has no membership in this project.');
  if (options.write) assertWritable(tenant);
  if (call.cancelled) throw failure(grpc.status.CANCELLED, 'The memory request was cancelled.');
  return tenant;
}

function assertWritable(tenant) {
  const permitted = tenant.user.permissions.includes('all') || ['owner', 'admin', 'member'].includes(tenant.role);
  if (!permitted) throw failure(grpc.status.PERMISSION_DENIED, 'The project membership is read-only.');
  if (tenant.status === 'archived') throw failure(grpc.status.FAILED_PRECONDITION, 'The project is archived.');
}

function searchOptions(call) {
  const request = call.request || {};
  const limit = request.limit || 5;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw failure(grpc.status.INVALID_ARGUMENT, 'limit must be between 1 and 100.');
  const vector = request.vector || [];
  if (vector.length && (vector.length !== 768 || vector.some(value => !Number.isFinite(value)))) {
    throw failure(grpc.status.INVALID_ARGUMENT, 'vector must contain 768 finite values.');
  }
  return { limit, ...(vector.length ? { vector } : {}) };
}

function errorStatus(error) {
  if (Number.isInteger(error.code)) return { code: error.code, message: error.message };
  if (error.code === 'MEMORY_SCOPE_CONFLICT') return { code: grpc.status.PERMISSION_DENIED, message: 'Memory identifier is unavailable in this scope.' };
  return { code: grpc.status.INTERNAL, message: 'Memory operation failed.' };
}

module.exports = { authorize, searchOptions, errorStatus };
