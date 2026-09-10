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

const DEFAULT_MCP_TIMEOUT_MS = 30000;
const MAX_MCP_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_MCP_BUFFER_BYTES = 1024 * 1024;
const MAX_MCP_ERROR_BYTES = 4096;
const MAX_MCP_HTTP_BYTES = 1024 * 1024;
const SAFE_MCP_ENV = new Set([
  'PATH', 'PATHEXT', 'ComSpec', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE',
  'LANG', 'LC_ALL', 'NODE_ENV'
]);

function isSensitiveEnvironmentName(name) {
  return /(?:TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|API)/i.test(name);
}

function normalizeMcpTimeout(value, fallback = DEFAULT_MCP_TIMEOUT_MS) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(Math.floor(numeric), MAX_MCP_TIMEOUT_MS);
}

function directToolLeaseAllows(toolName) {
  const disabled = String(process.env.GENOS_MCP_DISABLED_TOOLS || '').split(',').map((name) => name.trim()).filter(Boolean);
  if (disabled.includes(toolName)) return false;
  const lease = String(process.env.GENOS_MCP_LEASE || '').split(',').map((name) => name.trim()).filter(Boolean);
  return !lease.length || lease.includes(toolName);
}

async function directCallGuard(toolName, args) {
  const registry = getToolRegistry();
  if (!registry.isSupportedTool(toolName)) throw Object.assign(new Error(`Tool '${toolName}' is not registered.`), { code: 'MCP_TOOL_NOT_FOUND' });
  if (!directToolLeaseAllows(toolName)) throw Object.assign(new Error(`Tool '${toolName}' is outside the active MCP lease.`), { code: 'MCP_TOOL_LEASE_DENIED' });
  const argumentError = validateToolArguments(toolName, args);
  if (argumentError) throw argumentError;
  const circuit = circuitBreaker.canExecute(toolName, 'operator', 'global', args);
  if (!circuit.allowed) throw Object.assign(new Error(circuit.message), { code: circuit.reason || 'MCP_CIRCUIT_OPEN' });
  return circuit;
}

function getToolRegistry() {
  return require('./mcpToolRegistry');
}

function validateMcpUrl(value) {
  try {
    const parsed = new URL(String(value));
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'MCP endpoint must use http or https.';
    if (parsed.username || parsed.password) return 'MCP endpoint must not contain embedded credentials.';
    return null;
  } catch (_) {
    return 'MCP endpoint must be a valid URL.';
  }
}

function configuredTransport() {
  const url = process.env.GENOS_MCP_URL || process.env.GENOS_MCP_ENDPOINT;
  const command = process.env.GENOS_MCP_COMMAND;
  if (url) {
    const error = validateMcpUrl(url);
    return error ? { type: 'invalid', error } : { type: 'http', url };
  }
  if (command) return { type: 'stdio', command, args: parseArgs(process.env.GENOS_MCP_ARGS || '') };
  const bundledRelease = path.resolve(__dirname, '../../../target/release/genos-mcp');
  if (fs.existsSync(bundledRelease)) return { type: 'stdio', command: bundledRelease, args: ['stdio'], bundled: true };
  if (fs.existsSync(`${bundledRelease}.exe`)) return { type: 'stdio', command: `${bundledRelease}.exe`, args: ['stdio'], bundled: true };
  const bundled = path.resolve(__dirname, '../../../target/debug/genos-mcp');
  if (fs.existsSync(bundled)) return { type: 'stdio', command: bundled, args: ['stdio'], bundled: true };
  if (fs.existsSync(`${bundled}.exe`)) return { type: 'stdio', command: `${bundled}.exe`, args: ['stdio'], bundled: true };
  const mcpIndex = path.resolve(__dirname, '../../../mcp/index.js');
  if (fs.existsSync(mcpIndex)) return { type: 'stdio', command: process.execPath, args: [mcpIndex], bundled: true };
  return null;
}

function parseArgs(value) {
  const args = []; const matcher = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|([^\s]+)/g;
  let match;
  while ((match = matcher.exec(value))) args.push(match[1] ?? match[2] ?? match[3]);
  return args;
}

function rpcRequest(id, method, params = {}) {
  return { jsonrpc: '2.0', id, method, params };
}

function assertRpcResponse(payload, id, phase) {
  if (!payload || payload.jsonrpc !== '2.0' || payload.id !== id) {
    throw new Error(`MCP HTTP ${phase} returned a mismatched JSON-RPC response.`);
  }
  return payload;
}

function mcpTransportEnvironment(toolName, repositoryRoot, workspaceRoot) {
  const environment = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (SAFE_MCP_ENV.has(name) || (name.startsWith('GENOS_') && !isSensitiveEnvironmentName(name))) {
      environment[name] = value;
    }
  }
  return {
    ...environment,
    GENOS_WORKSPACE_ROOT: workspaceRoot,
    GENOS_BIN: process.env.GENOS_BIN || path.join(repositoryRoot, 'target/debug/genos'),
    GENOS_MCP_CLIENT: 'genos-backend',
    GENOS_MCP_LEASE: process.env.GENOS_MCP_LEASE || toolName
  };
}

async function readResponseTextBounded(response, limit = MAX_MCP_HTTP_BYTES) {
  if (!response.body?.getReader) return (await response.text()).slice(0, limit);
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
  return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}

async function readMcpHttpResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  const text = await readResponseTextBounded(response);
  if (!contentType.includes('text/event-stream')) return JSON.parse(text);
  const payloads = [];
  for (const event of text.split(/\r?\n\r?\n/)) {
    const data = event.split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n')
      .trim();
    if (!data || data === '[DONE]') continue;
    try { payloads.push(JSON.parse(data)); }
    catch (_) { throw new Error('MCP HTTP SSE response contained invalid JSON-RPC data.'); }
  }
  if (!payloads.length) throw new Error('MCP HTTP SSE response contained no JSON-RPC payload.');
  return payloads[payloads.length - 1];
}

async function describeHttpError(response, phase) {
  let detail = '';
  try { detail = (await readResponseTextBounded(response, MAX_MCP_ERROR_BYTES)).trim(); } catch (_) {}
  return `MCP HTTP ${phase} returned ${response.status}${detail ? `: ${detail}` : '.'}`;
}

async function fetchHttpPhase(requestContext, optionsArg, deadlineAtArg, phaseArg, readResponseArg) {
  const isObj = requestContext && typeof requestContext === 'object' && !optionsArg;
  const url = isObj ? requestContext.url : requestContext;
  const options = isObj ? requestContext.options : optionsArg;
  const deadlineAt = isObj ? requestContext.deadlineAt : deadlineAtArg;
  const phase = isObj ? requestContext.phase : phaseArg;
  const readResponse = (isObj ? requestContext.readResponse : readResponseArg) || ((response) => response);
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new Error(`MCP HTTP ${phase} timed out.`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remaining);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return await readResponse(response);
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`MCP HTTP ${phase} timed out.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function runSafeSync(commandLine, options = {}) {
  return runGenosSync(commandLine, options);
}

function runWithTimeout(commandLine, timeoutMs) {
  return runSafeSync(commandLine, { timeoutMs });
}

function resolveMcpOutputPath(outputFile) {
  if (typeof outputFile !== 'string' || !outputFile.trim() || outputFile.includes('\0') || path.isAbsolute(outputFile)) {
    throw Object.assign(new Error('output_file must be a non-empty relative path.'), { code: 'INVALID_OUTPUT_PATH' });
  }
  const root = path.resolve(process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..'));
  try {
    return resolveContainedPathNoSymlinkSync(root, outputFile, 'output_file');
  } catch (_) {
    throw Object.assign(new Error('output_file must remain inside the GenOS workspace and avoid symlinks.'), { code: 'INVALID_OUTPUT_PATH' });
  }
}

function validateMcpInputPaths(args = {}) {
  for (const field of ['graph_file', 'history_file', 'input_file', 'manifest']) {
    if (args[field] === undefined) continue;
    if (typeof args[field] !== 'string' || !args[field].trim() || path.isAbsolute(args[field])) {
      throw Object.assign(new Error(`${field} must be a relative workspace path.`), { code: 'INVALID_INPUT_PATH' });
    }
    try {
      resolveContainedPathNoSymlinkSync(path.resolve(process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..')), args[field], field);
    } catch (_) {
      throw Object.assign(new Error(`${field} must remain inside the GenOS workspace and avoid symlinks.`), { code: 'INVALID_INPUT_PATH' });
    }
  }
}

function withTimeout(promise, timeoutMs) {
  const timeout = normalizeMcpTimeout(timeoutMs);
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`MCP tool timed out after ${timeout}ms.`)), timeout))
  ]);
}

async function executeConfiguredTransport({ toolName, args = {}, timeoutMs = 30000 }) {
  timeoutMs = normalizeMcpTimeout(timeoutMs);
  const registry = getToolRegistry();
  const normalizedToolName = String(toolName || '').trim();
  const executionKind = registry.detectExecutionKind(normalizedToolName);
  if (!normalizedToolName) {
    return { configured: false, success: false, status: 'invalid_tool', error: 'toolName is required.' };
  }
  if (!registry.isSupportedTool(normalizedToolName)) {
    return { configured: false, success: false, status: 'unsupported', error: `Tool '${normalizedToolName}' is not supported by the runtime dispatch registry.`, executionKind };
  }
  if (!directToolLeaseAllows(normalizedToolName)) {
    return { configured: false, success: false, status: 'lease_denied', error: `Tool '${normalizedToolName}' is outside the active MCP lease.`, code: 'MCP_TOOL_LEASE_DENIED', executionKind };
  }
  const argumentError = validateToolArguments(normalizedToolName, args);
  if (argumentError) {
    return { configured: false, success: false, status: 'invalid_args', error: argumentError.message, code: argumentError.code };
  }
  try { validateMcpInputPaths(args); } catch (error) { return { configured: false, success: false, status: 'invalid_args', error: error.message, code: error.code }; }

  const runLocal = (cmd) => {
    try { return { configured: true, success: true, status: 'completed', transport: 'local', output: runSafeSync(cmd, { timeoutMs }).toString() }; }
    catch (e) { return { configured: true, success: false, status: e.code === 'ETIMEDOUT' ? 'timeout' : 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message }; }
  };
  if (process.env.GENOS_MCP_URL || process.env.GENOS_MCP_ENDPOINT || process.env.GENOS_MCP_COMMAND) {
    const transport = configuredTransport();
    if (transport?.type === 'invalid') return { configured: false, success: false, status: 'invalid_config', error: transport.error };
    const result = transport.type === 'http'
      ? await callHttpFn(transport.url, normalizedToolName, { args, timeoutMs })
      : await callStdioFn(transport, normalizedToolName, { args, timeoutMs });
    const isError = result.isError === true;
    return { configured: true, success: !isError, status: isError ? 'tool_error' : 'completed', transport: transport.type, output: result.structuredContent ?? result.content ?? result };
  }
  return executeToolLogic(toolName, args, runLocal);
}


async function execute(executionRequest) {
  const { agentId, organizationId, projectId, toolName, args = {}, taints = [] } = executionRequest;
  const db = await getDatabase();
  const scopeRow = agentId ? await db.get('SELECT w.organization_id, w.project_id FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?', agentId) : null;
  const circuitScope = organizationId && projectId
    ? `${organizationId}:${projectId}`
    : (scopeRow?.organization_id && scopeRow?.project_id ? `${scopeRow.organization_id}:${scopeRow.project_id}` : 'global');
  const threatScan = immuneSystem.scanThreats(JSON.stringify({ toolName, args, taints }));
  if (threatScan.threats.length) {
    const reason = `Immune threat scan blocked MCP execution: ${threatScan.threats.join(', ')}.`;
    await db.run(
      'INSERT INTO audit_logs (actor,agent_id,action,resource,decision,reason,payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
      agentId || 'immune_system', agentId || null, 'WORKFLOW_TOOL_CALL', toolName, 'deny', reason,
      JSON.stringify({ threats: threatScan.threats, organizationId, projectId })
    );
    telemetry.emitEvent({ eventType: 'IMMUNE_THREAT_BLOCKED', agentId: agentId || 'immune_system', action: 'MCP_EXECUTE', detail: reason, severity: 'critical', payload: { toolName, threats: threatScan.threats, organizationId, projectId } });
    return { success: false, status: 'blocked', error: reason, reason, threats: threatScan.threats, policy: { decision: 'deny', reason: 'IMMUNE_THREAT_DETECTED' } };
  }
  if (agentId) {
    const chromatinLock = checkChromatinLock(agentId, toolName);
    if (chromatinLock) {
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
  }
  const permissionRow = organizationId && projectId
    ? await db.get('SELECT * FROM agent_permissions WHERE agent_id = ? AND organization_id = ? AND project_id = ?', agentId, organizationId, projectId)
    : await db.get('SELECT * FROM agent_permissions WHERE agent_id = ? AND organization_id IS NULL AND project_id IS NULL', agentId);
  let permissions = permissionRow ? JSON.parse(permissionRow.permissions_json || '[]') : [];
  if (!permissionRow && (agentId === 'strategy_adapter' || agentId === 'system' || !agentId)) {
    permissions = ['*'];
  }
  const deniedTools = permissionRow ? JSON.parse(permissionRow.denied_tools_json || '[]') : [];
  const policy = platformSafety.validateToolCall({ agentId, toolName, args, permissions, deniedTools, taints });
  await db.run('INSERT INTO audit_logs (actor,agent_id,action,resource,decision,reason,payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)', agentId || 'system', agentId || null, 'WORKFLOW_TOOL_CALL', toolName, policy.decision, policy.reason, JSON.stringify({ args, taints, organizationId, projectId, policy }));
  if (policy.decision !== 'allow') return { success: false, status: policy.decision, policy };
  const tool = await db.get('SELECT * FROM mcp_tools WHERE name = ?', toolName);
  const isRegisteredInLogic = Boolean(require('./mcpArgumentValidation').REQUIRED_STRINGS?.[toolName]);
  if (!tool && !require('./mcpStrategyTools').isStrategyTool(toolName) && !require('./mcpBioTools').isBioTool(toolName) && !isRegisteredInLogic) return { success: false, status: 'not_found', error: `Unknown MCP tool: ${toolName}` };
  if (tool && tool.is_locked === 1) return { success: false, status: 'circuit_open', error: `Tool '${toolName}' is persisted in quarantine.` };
  const circuit = circuitBreaker.canExecute(toolName, 'operator', circuitScope, args);
  if (!circuit.allowed) return { success: false, status: 'circuit_open', error: circuit.message };
  try {
    const result = await executeConfiguredTransport({ toolName, args });
    if (result.success && (toolName.includes('test') || toolName.includes('verify') || toolName.includes('lint') || toolName.includes('check'))) {
      const outText = String(result.output || '').toLowerCase();
      if (outText.includes('failed') || outText.includes('failing') || outText.includes('error')) {
        result.domainVerdict = 'failure';
      } else if (outText.includes('pass') || outText.includes('success') || outText.includes('ok')) {
        result.domainVerdict = 'success';
      } else {
        result.domainVerdict = 'unverified';
      }
    }
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

async function listTools() {
  const registry = getToolRegistry();
  const { getToolInputSchema } = require('./mcpContract');
  return registry.declaredToolNames().map((name) => ({ name, description: `GenOS MCP tool '${name}'.`, inputSchema: getToolInputSchema(name) }));
}

async function callTool(toolName, args = {}, timeoutMs = DEFAULT_MCP_TIMEOUT_MS) {
  const normalizedToolName = String(toolName || '').trim();
  await directCallGuard(normalizedToolName, args);
  const db = await getDatabase();
  await db.run('INSERT INTO audit_logs (actor, agent_id, action, resource, decision, reason, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)', 'mcp-direct', null, 'MCP_DIRECT_CALL', normalizedToolName, 'allow', 'direct call guarded', JSON.stringify({ args, timeoutMs }));
  try {
    const result = await executeConfiguredTransport({ toolName: normalizedToolName, args, timeoutMs: normalizeMcpTimeout(timeoutMs) });
    if (result.success) circuitBreaker.recordSuccess(normalizedToolName);
    else if (result.configured) circuitBreaker.recordFailure(normalizedToolName, result.error || result.output || 'MCP tool failed.');
    if (!result.success) throw Object.assign(new Error(result.error || result.output || `MCP tool '${normalizedToolName}' failed.`), { code: result.code || 'MCP_TOOL_ERROR' });
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
