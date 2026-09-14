const { checkChromatinLock } = require('./chromatinLock');
const { getDatabase } = require('../db');
const circuitBreaker = require('./circuitBreaker');
const telemetry = require('./telemetryObserver');
const platformSafety = require('./platformSafetyService');
const { spawn } = require('child_process');
const { appendBounded } = require('./boundedOutput');
const fs = require('fs');
const path = require('path');
const { runGenosSync } = require('./genosCli');
const { terminateChild, clearTerminationTimer } = require('./processTermination');
const { resolveContainedPathNoSymlinkSync } = require('./pathSafety');
const { validateToolArguments } = require('./mcpArgumentValidation');
const immuneSystem = require('./immuneSystem');
const { callHttpFn } = require('./mcpExecutor/transports/http');
const { callStdioFn } = require('./mcpExecutor/transports/stdio');
const { executeToolLogic } = require('./mcpExecutor/transports/toolLogic');
const { executeConfiguredTransport, listTools, resolveMcpOutputPath, validateMcpInputPaths, runSafeSync } = require('./mcpExecutor/dispatch');

const {
  DEFAULT_MCP_TIMEOUT_MS,
  MAX_MCP_TIMEOUT_MS,
  MAX_MCP_BUFFER_BYTES,
  MAX_MCP_ERROR_BYTES,
  MAX_MCP_HTTP_BYTES,
  SAFE_MCP_ENV,
  isSensitiveEnvironmentName,
  normalizeMcpTimeout,
  directToolLeaseAllows,
  getToolRegistry,
  directCallGuard,
  validateMcpUrl,
  parseArgs,
  configuredTransport
} = require('./mcpExecutor/config');



function rpcRequest(id, method, params = {}) {
  return { jsonrpc: '2.0', id, method, params };
}

function assertRpcResponse(payload, id, phase) {
  if (!payload || payload.jsonrpc !== '2.0' || payload.id !== id) {
    throw new Error(`MCP HTTP ${phase} returned a mismatched JSON-RPC response.`);
  }
  return payload;
}

function mcpBaseEnvironment() {
  const environment = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (SAFE_MCP_ENV.has(name) || (name.startsWith('GENOS_') && !isSensitiveEnvironmentName(name))) {
      environment[name] = value;
    }
  }
  return environment;
}

function defaultGenosBinary(repositoryRoot) {
  const isWin = process.platform === 'win32';
  const debug = path.join(repositoryRoot, isWin ? 'target/debug/genos.exe' : 'target/debug/genos');
  const release = path.join(repositoryRoot, isWin ? 'target/release/genos.exe' : 'target/release/genos');
  if (fs.existsSync(debug)) return debug;
  return fs.existsSync(release) ? release : debug;
}

function resolveGenosBinary(repositoryRoot) {
  const fallback = defaultGenosBinary(repositoryRoot);
  const configured = process.env.GENOS_BIN;
  if (!configured || configured.toLowerCase().includes('program files')) return fallback;
  return configured;
}

function mcpTransportEnvironment(toolName, repositoryRoot, workspaceRoot) {
  return {
    ...mcpBaseEnvironment(),
    GENOS_WORKSPACE_ROOT: workspaceRoot,
    GENOS_BIN: resolveGenosBinary(repositoryRoot),
    GENOS_MCP_CLIENT: 'genos-backend',
    GENOS_MCP_LEASE: process.env.GENOS_MCP_LEASE !== undefined ? process.env.GENOS_MCP_LEASE : toolName
  };
}

function concatChunks(chunks) {
  const buffers = [];
  for (const chunk of chunks) buffers.push(Buffer.from(chunk));
  return Buffer.concat(buffers);
}

async function readResponseTextBounded(response, limit = MAX_MCP_HTTP_BYTES) {
  if (!response.body || !response.body.getReader) return (await response.text()).slice(0, limit);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) throw new Error(`MCP HTTP response exceeded the ${limit}-byte limit.`);
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder().decode(concatChunks(chunks));
}

function parseJsonPayload(data) {
  try {
    return JSON.parse(data);
  } catch (_) {
    throw new Error('MCP HTTP SSE response contained invalid JSON-RPC data.');
  }
}

function eventData(event) {
  const lines = [];
  for (const line of event.split(/\r?\n/)) {
    if (line.startsWith('data:')) lines.push(line.slice(5).replace(/^ /, ''));
  }
  return lines.join('\n').trim();
}

function parseSsePayloads(text) {
  const payloads = [];
  for (const event of text.split(/\r?\n\r?\n/)) {
    const data = eventData(event);
    if (!data || data === '[DONE]') continue;
    payloads.push(parseJsonPayload(data));
  }
  if (!payloads.length) throw new Error('MCP HTTP SSE response contained no JSON-RPC payload.');
  return payloads;
}

async function readMcpHttpResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  const text = await readResponseTextBounded(response);
  if (!contentType.includes('text/event-stream')) return JSON.parse(text);
  const payloads = parseSsePayloads(text);
  return payloads[payloads.length - 1];
}

async function describeHttpError(response, phase) {
  let detail = '';
  try { detail = (await readResponseTextBounded(response, MAX_MCP_ERROR_BYTES)).trim(); } catch (_) {}
  return `MCP HTTP ${phase} returned ${response.status}${detail ? `: ${detail}` : '.'}`;
}

function identity(value) {
  return value;
}

function normalizeHttpPhaseArgs(requestContext, optionsArg, rest) {
  const isObject = requestContext !== null && typeof requestContext === 'object' && !optionsArg;
  if (isObject) {
    return {
      url: requestContext.url,
      options: requestContext.options,
      deadlineAt: requestContext.deadlineAt,
      phase: requestContext.phase,
      readResponse: requestContext.readResponse
    };
  }
  return {
    url: requestContext,
    options: optionsArg,
    deadlineAt: rest[0],
    phase: rest[1],
    readResponse: rest[2]
  };
}

async function runHttpFetch(request, controller) {
  const response = await fetch(request.url, { ...request.options, signal: controller.signal });
  const readResponse = request.readResponse || identity;
  return readResponse(response);
}

async function fetchHttpPhase(requestContext, optionsArg, ...rest) {
  const request = normalizeHttpPhaseArgs(requestContext, optionsArg, rest);
  const remaining = request.deadlineAt - Date.now();
  if (remaining <= 0) throw new Error(`MCP HTTP ${request.phase} timed out.`);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, remaining);
  try {
    return await runHttpFetch(request, controller);
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`MCP HTTP ${request.phase} timed out.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function createTimeoutRejection(timeout) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject(new Error(`MCP tool timed out after ${timeout}ms.`));
    }, timeout);
  });
}

function withTimeout(promise, timeoutMs) {
  const timeout = normalizeMcpTimeout(timeoutMs);
  return Promise.race([promise, createTimeoutRejection(timeout)]);
}

async function resolveExecutionPolicy(db, request) {
  const { agentId, organizationId, projectId, toolName, args, taints } = request;
  const scopeRow = agentId ? await db.get('SELECT w.organization_id, w.project_id FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?', agentId) : null;
  const circuitScope = resolveCircuitScope(organizationId, projectId, scopeRow);
  const permissionRow = await getPermissionRow(db, { agentId, organizationId, projectId });
  const permissions = resolvePermissions(permissionRow, agentId);
  const deniedTools = permissionRow ? JSON.parse(permissionRow.denied_tools_json || '[]') : [];
  const policy = platformSafety.validateToolCall({ agentId, toolName, args, permissions, deniedTools, taints });
  await db.run('INSERT INTO audit_logs (actor,agent_id,action,resource,decision,reason,payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)', agentId || 'system', agentId || null, 'WORKFLOW_TOOL_CALL', toolName, policy.decision, policy.reason, JSON.stringify({ args, taints, organizationId, projectId, policy }));
  return { circuitScope, policy };
}

function resolveCircuitScope(organizationId, projectId, scopeRow) {
  if (organizationId && projectId) return `${organizationId}:${projectId}`;
  if (scopeRow && scopeRow.organization_id && scopeRow.project_id) return `${scopeRow.organization_id}:${scopeRow.project_id}`;
  return 'global';
}

async function getPermissionRow(db, request) {
  const { agentId, organizationId, projectId } = request;
  if (organizationId && projectId) {
    return db.get('SELECT * FROM agent_permissions WHERE agent_id = ? AND organization_id = ? AND project_id = ?', agentId, organizationId, projectId);
  }
  return db.get('SELECT * FROM agent_permissions WHERE agent_id = ? AND organization_id IS NULL AND project_id IS NULL', agentId);
}

function resolvePermissions(permissionRow, agentId) {
  if (permissionRow) return JSON.parse(permissionRow.permissions_json || '[]');
  if (agentId === 'strategy_adapter' || agentId === 'system' || !agentId) return ['*'];
  return [];
}

async function screenImmuneThreats(db, request) {
  const { agentId, organizationId, projectId, toolName, args, taints } = request;
  const threatScan = immuneSystem.scanThreats(JSON.stringify({ toolName, args, taints }));
  if (!threatScan.threats.length) return null;
  const reason = `Immune threat scan blocked MCP execution: ${threatScan.threats.join(', ')}.`;
  await db.run(
    'INSERT INTO audit_logs (actor,agent_id,action,resource,decision,reason,payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
    agentId || 'immune_system', agentId || null, 'WORKFLOW_TOOL_CALL', toolName, 'deny', reason,
    JSON.stringify({ threats: threatScan.threats, organizationId, projectId })
  );
  telemetry.emitEvent({ eventType: 'IMMUNE_THREAT_BLOCKED', agentId: agentId || 'immune_system', action: 'MCP_EXECUTE', detail: reason, severity: 'critical', payload: { toolName, threats: threatScan.threats, organizationId, projectId } });
  return { success: false, status: 'blocked', error: reason, reason, threats: threatScan.threats, policy: { decision: 'deny', reason: 'IMMUNE_THREAT_DETECTED' } };
}

async function screenChromatinLock(db, request) {
  const { agentId, organizationId, projectId, toolName, args, taints } = request;
  if (!agentId) return null;
  const chromatinLock = checkChromatinLock(agentId, toolName);
  if (!chromatinLock) return null;
  const reason = chromatinLock.reason || 'Tool locked in heterochromatin';
  await db.run(
    'INSERT INTO audit_logs (actor,agent_id,action,resource,decision,reason,payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
    agentId, agentId, 'WORKFLOW_TOOL_CALL', toolName, 'deny', reason,
    JSON.stringify({ args, taints, organizationId, projectId, chromatin: chromatinLock })
  );
  telemetry.emitEvent({
    eventType: 'WORKFLOW_MCP_TOOL_FAILED', agentId, action: 'MCP_EXECUTE',
    detail: `Tool '${toolName}' blocked: ${reason}.`, severity: 'warning',
    payload: { toolName, args, chromatin: chromatinLock }
  });
  return {
    success: false, status: 'deny', error: reason, reason,
    policy: { decision: 'deny', reason }
  };
}

async function checkToolAvailability(db, toolName) {
  const tool = await db.get('SELECT * FROM mcp_tools WHERE name = ?', toolName);
  const requiredStrings = require('./mcpArgumentValidation').REQUIRED_STRINGS;
  const isRegisteredInLogic = Boolean(requiredStrings && requiredStrings[toolName]);
  if (!tool && !require('./mcpStrategyTools').isStrategyTool(toolName) && !require('./mcpBioTools').isBioTool(toolName) && !isRegisteredInLogic) {
    return { success: false, status: 'not_found', error: `Unknown MCP tool: ${toolName}` };
  }
  if (tool && tool.is_locked === 1) {
    return { success: false, status: 'circuit_open', error: `Tool '${toolName}' is persisted in quarantine.` };
  }
  return null;
}

function checkCircuitBreaker(toolName, circuitScope, args) {
  const circuit = circuitBreaker.canExecute(toolName, 'operator', circuitScope, args);
  if (circuit.allowed) return null;
  return { success: false, status: 'circuit_open', error: circuit.message };
}

function isVerdictTool(toolName) {
  if (toolName.includes('test')) return true;
  if (toolName.includes('verify')) return true;
  if (toolName.includes('lint')) return true;
  return toolName.includes('check');
}

function classifyDomainVerdict(text) {
  if (text.includes('failed') || text.includes('failing') || text.includes('error')) return 'failure';
  if (text.includes('pass') || text.includes('success') || text.includes('ok')) return 'success';
  return 'unverified';
}

function applyDomainVerdict(toolName, result) {
  if (!result.success) return;
  if (!isVerdictTool(toolName)) return;
  result.domainVerdict = classifyDomainVerdict(String(result.output || '').toLowerCase());
}

async function runToolExecution(context) {
  const { agentId, toolName, args, circuitScope } = context;
  try {
    const result = await executeConfiguredTransport({ toolName, args });
    applyDomainVerdict(toolName, result);
    if (result.success) circuitBreaker.recordSuccess(toolName, circuitScope);
    else if (result.configured) circuitBreaker.recordFailure(toolName, result.error || `MCP tool '${toolName}' failed.`, circuitScope);
    telemetry.emitEvent({ eventType: result.success ? 'WORKFLOW_MCP_TOOL_COMPLETED' : 'WORKFLOW_MCP_TOOL_FAILED', agentId, action: 'MCP_EXECUTE', detail: `MCP tool '${toolName}' ${result.status}.`, severity: result.success ? 'info' : 'warning', payload: { toolName, args, result } });
    return result;
  } catch (error) {
    circuitBreaker.recordFailure(toolName, error.message, circuitScope);
    telemetry.emitEvent({ eventType: 'WORKFLOW_MCP_TOOL_FAILED', agentId, action: 'MCP_EXECUTE', detail: error.message, severity: 'warning', payload: { toolName, args } });
    return { success: false, status: 'failed', error: error.message };
  }
}

async function execute(executionRequest) {
  const { agentId, organizationId, projectId, toolName, args = {}, taints = [] } = executionRequest;
  const db = await getDatabase();
  const request = { agentId, organizationId, projectId, toolName, args, taints };
  const { circuitScope, policy } = await resolveExecutionPolicy(db, request);
  if (policy.decision !== 'allow') return { success: false, status: policy.decision, policy };
  const immuneFault = await screenImmuneThreats(db, request);
  if (immuneFault) return immuneFault;
  const chromatinFault = await screenChromatinLock(db, request);
  if (chromatinFault) return chromatinFault;
  const unavailable = await checkToolAvailability(db, toolName);
  if (unavailable) return unavailable;
  const circuitFault = checkCircuitBreaker(toolName, circuitScope, args);
  if (circuitFault) return circuitFault;
  return runToolExecution({ agentId, toolName, args, circuitScope });
}

function recordCallResult(toolName, result) {
  if (result.success) {
    circuitBreaker.recordSuccess(toolName);
    return;
  }
  if (result.configured) circuitBreaker.recordFailure(toolName, result.error || result.output || 'MCP tool failed.');
  throw Object.assign(new Error(result.error || result.output || `MCP tool '${toolName}' failed.`), { code: result.code || 'MCP_TOOL_ERROR' });
}

async function callTool(toolName, args = {}, timeoutMs = DEFAULT_MCP_TIMEOUT_MS) {
  const normalizedToolName = String(toolName || '').trim();
  await directCallGuard(normalizedToolName, args);
  const db = await getDatabase();
  await db.run('INSERT INTO audit_logs (actor, agent_id, action, resource, decision, reason, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)', 'mcp-direct', null, 'MCP_DIRECT_CALL', normalizedToolName, 'allow', 'direct call guarded', JSON.stringify({ args, timeoutMs }));
  try {
    const result = await executeConfiguredTransport({ toolName: normalizedToolName, args, timeoutMs: normalizeMcpTimeout(timeoutMs), preValidated: true });
    recordCallResult(normalizedToolName, result);
    return result.output;
  } catch (error) {
    circuitBreaker.recordFailure(normalizedToolName, error.message);
    throw error;
  }
}

module.exports = {
  execute,
  executeConfiguredTransport,
  configuredTransport,
  checkChromatinLock,
  normalizeMcpTimeout,
  listTools,
  callTool,
  mcpTransportEnvironment,
  validateMcpUrl,
  resolveMcpOutputPath,
  validateMcpInputPaths,
  directToolLeaseAllows,
  fetchHttpPhase,
  readMcpHttpResponse,
  assertRpcResponse,
  describeHttpError,
  readResponseTextBounded,
  rpcRequest,
  parseArgs,
  runSafeSync
};
