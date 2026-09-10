const { spawn } = require('child_process');
const { appendBounded } = require('../../boundedOutput');
const { terminateChild, clearTerminationTimer } = require('../../processTermination');

async function callStdioFn(transport, toolName, options = {}) {
  const { parseArgs, mcpTransportEnvironment, normalizeMcpTimeout } = require('../../mcpExecutor');
  const { command: commandLine, args: cmdArgs = [] } = transport;
  const { args: toolArgs = {} } = options;
  const timeoutMs = normalizeMcpTimeout(options.timeoutMs);
  const deadlineAt = Date.now() + timeoutMs;
  const tokens = parseArgs(commandLine);
  const executable = tokens.shift();
  if (!executable) throw new Error('GENOS_MCP_COMMAND is empty.');
  const repositoryRoot = require('path').resolve(__dirname, '../../..');
  const workspaceRoot = process.env.GENOS_WORKSPACE_ROOT || repositoryRoot;
  const child = spawn(executable, [...tokens, ...cmdArgs], { cwd: workspaceRoot, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'], env: mcpTransportEnvironment(toolName, repositoryRoot, workspaceRoot) });
  let buffer = ''; let stderr = ''; let protocolErrors = ''; let pending = null; let closed = false;
  child.stderr.on('data', (chunk) => { stderr = appendBounded(stderr, chunk); });
  child.stdout.on('data', (chunk) => {
    buffer = appendBounded(buffer, chunk, 1024 * 1024);
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let payload;
      try { payload = JSON.parse(line); }
      catch (_) { protocolErrors = appendBounded(protocolErrors, `MCP STDIO returned invalid JSON-RPC data: ${line.slice(0, 200)}\n`); continue; }
      if (pending && payload.id === pending.id) {
        const { resolve, timer } = pending;
        pending = null;
        clearTimeout(timer);
        resolve(payload);
      }
    }
  });
  const waitFor = (id) => new Promise((resolve, reject) => {
    if (closed) return reject(new Error('MCP STDIO process closed before the request was sent.'));
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) return reject(new Error(`MCP STDIO request timed out after ${timeoutMs}ms.`));
    const timer = setTimeout(() => {
      pending = null;
      terminateChild(child);
      reject(new Error(`MCP STDIO request timed out after ${timeoutMs}ms.${protocolErrors ? ` ${protocolErrors.trim()}` : ''}`));
    }, remaining);
    pending = { id, resolve, reject, timer };
  });
  child.once('error', (error) => {
    closed = true;
    if (!pending) return;
    const { reject, timer } = pending;
    pending = null;
    clearTimeout(timer);
    reject(error);
  });
  child.once('close', (code, signal) => {
    closed = true;
    if (!pending) return;
    const { reject, timer } = pending;
    pending = null;
    clearTimeout(timer);
    const diagnostics = stderr ? `: ${stderr}` : '';
    reject(new Error(`MCP STDIO process exited before response (code=${code}, signal=${signal || 'none'})${diagnostics}${protocolErrors ? `: ${protocolErrors}` : ''}`));
  });
  try {
    const initializedPromise = waitFor(1);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'genos-backend', version: '1.0.0' } } })}\n`);
    const initialized = await initializedPromise;
    if (initialized.error) throw new Error(initialized.error.message || 'MCP STDIO initialize failed.');
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
    const responsePromise = waitFor(2);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: toolName, arguments: toolArgs } })}\n`);
    const response = await responsePromise;
    if (response.error) throw new Error(response.error.message || 'MCP STDIO tools/call failed.');
    return response.result || response;
  } finally {
    if (pending) {
      clearTimeout(pending.timer);
      pending = null;
    }
    try {
      if (!child.stdin.destroyed && child.stdin.writable) child.stdin.end();
    } catch (_) {}
    if (!child.killed && child.exitCode === null) {
      terminateChild(child);
    } else {
      clearTerminationTimer(child);
    }
  }
}

module.exports = { callStdioFn };
