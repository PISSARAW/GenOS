const { getDatabase } = require('../db');
const circuitBreaker = require('./circuitBreaker');
const telemetry = require('./telemetryObserver');
const platformSafety = require('./platformSafetyService');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function configuredTransport() {
  const url = process.env.GENOS_MCP_URL || process.env.GENOS_MCP_ENDPOINT;
  const command = process.env.GENOS_MCP_COMMAND;
  if (url) return { type: 'http', url };
  if (command) return { type: 'stdio', command, args: parseArgs(process.env.GENOS_MCP_ARGS || '') };
  // The backend and bundled MCP are shipped together. Use that local, full
  // control-plane endpoint for autonomous recovery actions; external callers
  // still see only genos_orchestrate by default.
  const bundled = path.resolve(__dirname, '../../../target/debug/genos-mcp');
  if (fs.existsSync(bundled)) return { type: 'stdio', command: bundled, args: ['stdio'], bundled: true };
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

async function callHttp(url, toolName, args, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const auth = process.env.GENOS_MCP_TOKEN ? { authorization: `Bearer ${process.env.GENOS_MCP_TOKEN}` } : {};
  try {
    const initialize = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...auth }, body: JSON.stringify(rpcRequest(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'genos-backend', version: '1.0.0' } })), signal: controller.signal });
    if (!initialize.ok) throw new Error(`MCP HTTP initialize returned ${initialize.status}.`);
    const initPayload = await initialize.json();
    if (initPayload.error) throw new Error(initPayload.error.message || 'MCP initialize failed.');
    await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }), signal: controller.signal }).catch(() => {});
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...auth }, body: JSON.stringify(rpcRequest(2, 'tools/call', { name: toolName, arguments: args })), signal: controller.signal });
    if (!response.ok) throw new Error(`MCP HTTP tools/call returned ${response.status}.`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error.message || 'MCP tools/call failed.');
    return payload.result || payload;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`MCP request timed out after ${timeoutMs}ms.`);
    throw error;
  } finally { clearTimeout(timer); }
}

async function callStdio(commandLine, args, toolName, toolArgs, timeoutMs) {
  const tokens = parseArgs(commandLine);
  const executable = tokens.shift();
  if (!executable) throw new Error('GENOS_MCP_COMMAND is empty.');
  const repositoryRoot = path.resolve(__dirname, '../../..');
  const workspaceRoot = process.env.GENOS_WORKSPACE_ROOT || repositoryRoot;
  const child = spawn(executable, [...tokens, ...args], { cwd: workspaceRoot, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, GENOS_WORKSPACE_ROOT: workspaceRoot, GENOS_BIN: process.env.GENOS_BIN || path.join(repositoryRoot, 'target/debug/genos'), GENOS_MCP_CLIENT: 'genos-backend' } });
  let buffer = ''; let stderr = ''; let pending = null;
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let payload; try { payload = JSON.parse(line); } catch (_) { continue; }
      if (pending && payload.id === pending.id) {
        const { resolve, timer } = pending;
        pending = null;
        clearTimeout(timer);
        resolve(payload);
      }
    }
  });
  const waitFor = (id) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending = null;
      child.kill('SIGKILL');
      reject(new Error(`MCP STDIO request timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    pending = { id, resolve, reject, timer };
  });
  child.once('error', (error) => {
    if (!pending) return;
    const { reject, timer } = pending;
    pending = null;
    clearTimeout(timer);
    reject(error);
  });
  try {
    child.stdin.write(`${JSON.stringify(rpcRequest(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'genos-backend', version: '1.0.0' } }))}\n`);
    const initialized = await waitFor(1);
    if (initialized.error) throw new Error(initialized.error.message || 'MCP STDIO initialize failed.');
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {}})}\n`);
    child.stdin.write(`${JSON.stringify(rpcRequest(2, 'tools/call', { name: toolName, arguments: toolArgs }))}\n`);
    const response = await waitFor(2);
    if (response.error) throw new Error(response.error.message || 'MCP STDIO tools/call failed.');
    return response.result || response;
  } finally { child.kill('SIGTERM'); if (stderr) {} }
}

async function executeConfiguredTransport({ toolName, args = {}, timeoutMs = 30000 }) {
  const transport = configuredTransport();
  if (!transport) return { configured: false, success: false, status: 'unavailable', error: 'No MCP transport configured. Set GENOS_MCP_URL or GENOS_MCP_COMMAND.' };
  const result = transport.type === 'http'
    ? await callHttp(transport.url, toolName, args, timeoutMs)
    : await callStdio(transport.command, transport.args, toolName, args, timeoutMs);
  const isError = result.isError === true;
  return { configured: true, success: !isError, status: isError ? 'tool_error' : 'completed', transport: transport.type, output: result.structuredContent ?? result.content ?? result };
}

async function execute({ agentId, toolName, args = {}, taints = [] }) {
  const db = await getDatabase();
  const permissionRow = await db.get('SELECT * FROM agent_permissions WHERE agent_id = ?', agentId);
  const permissions = permissionRow ? JSON.parse(permissionRow.permissions_json || '[]') : [];
  const deniedTools = permissionRow ? JSON.parse(permissionRow.denied_tools_json || '[]') : [];
  const policy = platformSafety.validateToolCall({ agentId, toolName, args, permissions, deniedTools, taints });
  await db.run('INSERT INTO audit_logs (actor,agent_id,action,resource,decision,reason,payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)', agentId, agentId, 'WORKFLOW_TOOL_CALL', toolName, policy.decision, policy.reason, JSON.stringify({ args, taints, policy }));
  if (policy.decision !== 'allow') return { success: false, status: policy.decision, policy };
  const tool = await db.get('SELECT * FROM mcp_tools WHERE name = ?', toolName);
  if (!tool) return { success: false, status: 'not_found', error: `Unknown MCP tool: ${toolName}` };
  if (tool.is_locked === 1) return { success: false, status: 'circuit_open', error: `Tool '${toolName}' is persisted in quarantine.` };
  const circuit = circuitBreaker.canExecute(toolName, 'operator');
  if (!circuit.allowed) return { success: false, status: 'circuit_open', error: circuit.message };
  try {
    const result = await executeConfiguredTransport({ toolName, args });
    if (result.success) circuitBreaker.recordSuccess(toolName);
    else if (result.configured) circuitBreaker.recordFailure(toolName, result.error || `MCP tool '${toolName}' failed.`);
    telemetry.emitEvent({ eventType: result.success ? 'WORKFLOW_MCP_TOOL_COMPLETED' : 'WORKFLOW_MCP_TOOL_FAILED', agentId, action: 'MCP_EXECUTE', detail: `MCP tool '${toolName}' ${result.status}.`, severity: result.success ? 'info' : 'warning', payload: { toolName, args, result } });
    return result;
  } catch (error) {
    circuitBreaker.recordFailure(toolName, error.message);
    telemetry.emitEvent({ eventType: 'WORKFLOW_MCP_TOOL_FAILED', agentId, action: 'MCP_EXECUTE', detail: error.message, severity: 'warning', payload: { toolName, args } });
    return { success: false, status: 'failed', error: error.message };
  }
}

module.exports = { execute, executeConfiguredTransport, configuredTransport };
