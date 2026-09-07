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

function trustedMcpCommand(command, args) {
  const bundledBinary = [
    path.resolve(__dirname, '../../../target/debug/genos-mcp'),
    path.resolve(__dirname, '../../../target/debug/genos-mcp.exe'),
    path.resolve(__dirname, '../../../target/release/genos-mcp'),
    path.resolve(__dirname, '../../../target/release/genos-mcp.exe')
  ];
  const bundledScript = path.resolve(__dirname, '../../../mcp/index.js');
  const resolvedCommand = path.resolve(command);
  if (bundledBinary.includes(resolvedCommand)) return true;
  return path.resolve(command) === path.resolve(process.execPath)
    && args.length === 1
    && path.resolve(args[0]) === bundledScript;
}

function configuredTransport() {
  const url = process.env.GENOS_MCP_URL || process.env.GENOS_MCP_ENDPOINT;
  const command = process.env.GENOS_MCP_COMMAND;
  if (url) {
    const error = validateMcpUrl(url);
    return error ? { type: 'invalid', error } : { type: 'http', url };
  }
  if (command) {
    const args = parseArgs(process.env.GENOS_MCP_ARGS || '');
    if (!trustedMcpCommand(command, args)) {
      return { type: 'invalid', error: 'GENOS_MCP_COMMAND must point to the bundled GenOS MCP executable or mcp/index.js.' };
    }
    return { type: 'stdio', command, args };
  }
  // The backend and bundled MCP are shipped together. Use that local, full
  // control-plane endpoint for autonomous recovery actions; external callers
  // still see only genos_orchestrate by default.
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

async function fetchHttpPhase(url, options, deadlineAt, phase, readResponse = (response) => response) {
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

function withTimeout(promise, timeoutMs) {
  const timeout = normalizeMcpTimeout(timeoutMs);
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`MCP tool timed out after ${timeout}ms.`)), timeout))
  ]);
}

async function callHttp(url, toolName, options = {}) {
  const { args = {} } = options;
  const timeoutMs = normalizeMcpTimeout(options.timeoutMs);
  const deadlineAt = Date.now() + timeoutMs;
  const auth = process.env.GENOS_MCP_TOKEN ? { authorization: `Bearer ${process.env.GENOS_MCP_TOKEN}` } : {};
  const protocolHeaders = { 'MCP-Protocol-Version': '2025-06-18' };
  try {
    const initResponse = await fetchHttpPhase(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...protocolHeaders, ...auth }, body: JSON.stringify(rpcRequest(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'genos-backend', version: '1.0.0' } })) }, deadlineAt, 'initialize', async (response) => {
      if (!response.ok) throw new Error(await describeHttpError(response, 'initialize'));
      return { payload: await readMcpHttpResponse(response), sessionId: response.headers.get('mcp-session-id') };
    });
    const initPayload = assertRpcResponse(initResponse.payload, 1, 'initialize');
    const sessionHeaders = initResponse.sessionId ? { 'Mcp-Session-Id': initResponse.sessionId } : {};
    if (initPayload.error) throw new Error(initPayload.error.message || 'MCP initialize failed.');
    await fetchHttpPhase(url, { method: 'POST', headers: { 'content-type': 'application/json', ...protocolHeaders, ...sessionHeaders, ...auth }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) }, deadlineAt, 'initialized notification', async (response) => {
      if (!response.ok) throw new Error(await describeHttpError(response, 'initialized notification'));
      return null;
    });
    const payload = assertRpcResponse(await fetchHttpPhase(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...protocolHeaders, ...sessionHeaders, ...auth }, body: JSON.stringify(rpcRequest(2, 'tools/call', { name: toolName, arguments: args })) }, deadlineAt, 'tools/call', async (response) => {
      if (!response.ok) throw new Error(await describeHttpError(response, 'tools/call'));
      return readMcpHttpResponse(response);
    }), 2, 'tools/call');
    if (payload.error) throw new Error(payload.error.message || 'MCP tools/call failed.');
    return payload.result || payload;
  } catch (error) {
    throw error;
  }
}

async function callStdio(transport, toolName, options = {}) {
  const { command: commandLine, args: cmdArgs = [] } = transport;
  const { args: toolArgs = {} } = options;
  const timeoutMs = normalizeMcpTimeout(options.timeoutMs);
  const deadlineAt = Date.now() + timeoutMs;
  const tokens = parseArgs(commandLine);
  const executable = tokens.shift();
  if (!executable) throw new Error('GENOS_MCP_COMMAND is empty.');
  const repositoryRoot = path.resolve(__dirname, '../../..');
  const workspaceRoot = process.env.GENOS_WORKSPACE_ROOT || repositoryRoot;
  const child = spawn(executable, [...tokens, ...cmdArgs], { cwd: workspaceRoot, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'], env: mcpTransportEnvironment(toolName, repositoryRoot, workspaceRoot) });
  let buffer = ''; let stderr = ''; let protocolErrors = ''; let pending = null; let closed = false;
  child.stderr.on('data', (chunk) => { stderr = appendBounded(stderr, chunk); });
  child.stdout.on('data', (chunk) => {
    buffer = appendBounded(buffer, chunk, MAX_MCP_BUFFER_BYTES);
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
    child.stdin.write(`${JSON.stringify(rpcRequest(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'genos-backend', version: '1.0.0' } }))}\n`);
    const initialized = await initializedPromise;
    if (initialized.error) throw new Error(initialized.error.message || 'MCP STDIO initialize failed.');
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {}})}\n`);
    const responsePromise = waitFor(2);
    child.stdin.write(`${JSON.stringify(rpcRequest(2, 'tools/call', { name: toolName, arguments: toolArgs }))}\n`);
    const response = await responsePromise;
    if (response.error) throw new Error(response.error.message || 'MCP STDIO tools/call failed.');
    return response.result || response;
  } finally {
    if (pending) {
      clearTimeout(pending.timer);
      pending = null;
    }
    if (!child.stdin.destroyed) child.stdin.end();
    if (!child.killed) {
      terminateChild(child);
    } else {
      clearTerminationTimer(child);
    }
  }
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
  const argumentError = validateToolArguments(normalizedToolName, args);
  if (argumentError) {
    return { configured: false, success: false, status: 'invalid_args', error: argumentError.message, code: argumentError.code };
  }

  const runLocal = (cmd) => {
    try { return { configured: true, success: true, status: 'completed', transport: 'local', output: runSafeSync(cmd, { timeoutMs }).toString() }; }
    catch (e) { return { configured: true, success: false, status: e.code === 'ETIMEDOUT' ? 'timeout' : 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message }; }
  };
  if (process.env.GENOS_MCP_URL || process.env.GENOS_MCP_ENDPOINT || process.env.GENOS_MCP_COMMAND) {
    const transport = configuredTransport();
    if (transport?.type === 'invalid') return { configured: false, success: false, status: 'invalid_config', error: transport.error };
    const result = transport.type === 'http'
      ? await callHttp(transport.url, normalizedToolName, { args, timeoutMs })
      : await callStdio(transport, normalizedToolName, { args, timeoutMs });
    const isError = result.isError === true;
    return { configured: true, success: !isError, status: isError ? 'tool_error' : 'completed', transport: transport.type, output: result.structuredContent ?? result.content ?? result };
  }
  if (toolName === 'genos_agent_world_capsule') {
    return runLocal(['capsule', 'create', '--snapshot', args.snapshot_id].concat(args.seed ? ['--seed', args.seed] : [], args.budget_steps ? ['--budget-steps', String(args.budget_steps)] : []));
  }
  if (toolName === 'genos_deterministic_sha256_rag') {
    if (args.action === 'ingest') return runLocal(['platform', 'ingest', args.document].concat(args.index ? ['--index', args.index] : []));
    if (args.action === 'search') return runLocal(['platform', 'search', args.query].concat(args.index ? ['--index', args.index] : []));
    return { configured: true, success: false, status: 'tool_error', transport: 'local', output: 'Invalid action for RAG.' };
  }
    if (toolName === 'genos_world_sandbox_execute') {
      return runLocal(['world', 'run', '--provider', 'directory', '--root', '.genos/world', '--world-id', args.world_id, '--command', args.command, '--sandbox-backend', args.backend]);
    }
    if (toolName === 'genos_world_hardlink_create') {
      return runLocal(['world', 'create', '--provider', 'hardlink', '--root', '.genos/world', '--world-id', args.world_id, '--seed', args.seed]);
    }
    if (toolName === 'genos_replay') {
      const snapshot = args.snapshot || args.snapshot_id;
      if (!snapshot) {
        return { configured: true, success: false, status: 'invalid_args', transport: 'local', error: 'Replay requires a snapshot reference.' };
      }
      return runLocal(['replay', 'basic', '--snapshot', snapshot]);
    }
    if (toolName === 'genos_biomimicry_sar_prime') {
      return runLocal(['biomimicry', 'bio-feature', '--feature', 'sar', '--action', 'prime', '--param', `incident_id=${args.incident_id}`, '--param', `severity=${args.severity || 1.0}`]);
    }
    if (toolName === 'genos_advanced_budget_allocation') {
    const cmdParams = ['--param', `total_budget=${args.total_budget}`];
    if (args.entropy !== undefined) cmdParams.push('--param', `entropy=${args.entropy}`);
    if (args.scenarios) args.scenarios.forEach((scenario) => cmdParams.push('--param', `scenario=${scenario}`));
    return runLocal(['biomimicry', 'bio-feature', '--feature', 'bet-hedging', '--action', 'allocate', ...cmdParams]);
  }
  if (toolName === 'genos_merge') return runLocal(['merge', args.branch_id, '--conditions', args.conditions]);
  if (toolName === 'genos_export_audit') return runLocal(['audit', args.snapshot_id, '--output', args.output || `audit_${args.snapshot_id}.log`]);
  if (toolName === 'genos_cost_accounting') return runLocal(['cost-accounting', args.agent_id].concat(args.timeframe ? ['--timeframe', args.timeframe] : []));
  if (toolName === 'genos_loop_detection_check') {
    const cp = require('child_process');
    const { history_file, exact_match = 3, stagnation = 5, similarity = 0.95 } = args;
    try {
      const out = runWithTimeout(['loop-detection', '--history-file', history_file, '--exact-match', String(exact_match), '--stagnation', String(stagnation), '--similarity', String(similarity)], timeoutMs);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_causality_fork') {
    const cp = require('child_process');
    const { boundary_id, new_boundary_id } = args;
    try {
      const out = runWithTimeout(['causality', 'fork', '--boundary-id', boundary_id, '--new-boundary-id', new_boundary_id], timeoutMs);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_causal_replay_experiment') {
    const cp = require('child_process');
    try {
      const out = runWithTimeout(['experiment', 'causal-replay', args.input_file], timeoutMs);
      const outputPath = resolveMcpOutputPath(args.output_file);
      require('fs').writeFileSync(outputPath, out);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: `Causal replay report written to ${outputPath}` };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_incident_experiment') {
    const cp = require('child_process');
    try {
      const out = runWithTimeout(['experiment', 'incident', args.manifest], timeoutMs);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_bug_investigation') {
    const cp = require('child_process');
    try {
      const out = runWithTimeout(['experiment', 'bug-investigation', args.manifest], timeoutMs);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_phenotype_measure_divergence') {
    const cp = require('child_process');
    const { trait_name, expected, observed, tolerance } = args;
    try {
      const out = runWithTimeout(['phenotype', 'measure-divergence', '--trait-name', trait_name, '--expected', String(expected), '--observed', String(observed), '--tolerance', String(tolerance)], timeoutMs);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_synaptic_stdp_update') {
    const strategyExecutionAdapter = require('./strategyExecutionAdapter');
    const primitiveArgs = {
      sourceId: args.source_id || args.sourceId || args.causeId,
      targetId: args.target_id || args.targetId || args.effectId,
      preSpikeAt: args.pre_spike_at || args.preSpikeAt,
      postSpikeAt: args.post_spike_at || args.postSpikeAt,
      learningRate: args.learning_rate || args.learningRate || args.outcome_score,
      transmitterType: args.transmitter_type || args.transmitterType || args.trait,
      agentId: args.agent_id || args.agentId,
      ...args
    };
    const res = await strategyExecutionAdapter.executePrimitive('stdp_update', primitiveArgs);
    const ok = res && res.success !== false;
    return {
      configured: true,
      success: ok,
      status: ok ? 'completed' : 'tool_error',
      transport: 'strategy_primitive',
      output: res
    };
  }
  if (toolName === 'genos_synaptic_prune_scale') {
    const threshold = Number(args.threshold ?? 0.1) * Number(args.scale ?? 1.0);
    const agentId = args.agent_id || args.agentId;
    const orgId = args.organization_id || args.organizationId;
    const projId = args.project_id || args.projectId;
    const db = await getDatabase();
    let prunedCount = 0;
    if (db) {
      let sql = 'DELETE FROM memory_synapses WHERE (ABS(weight) < ? OR (c3_opsonization > 0.5 AND cd47_expression < 0.5))';
      const params = [threshold];
      if (agentId && agentId !== 'global' && agentId !== 'default-agent') {
        sql += ' AND (source_id IN (SELECT id FROM genome_decisions WHERE created_by = ?) OR target_id IN (SELECT id FROM genome_decisions WHERE created_by = ?))';
        params.push(agentId, agentId);
      }
      if (orgId) {
        sql += ' AND (organization_id = ? OR organization_id IS NULL)';
        params.push(orgId);
      }
      if (projId) {
        sql += ' AND (project_id = ? OR project_id IS NULL)';
        params.push(projId);
      }
      const res = await db.run(sql, ...params);
      prunedCount = res?.changes || 0;

      // Cleanup orphaned weak decisions
      const doomed = await db.all(`
        SELECT g.id FROM genome_decisions g
        LEFT JOIN memory_synapses s ON g.id = s.source_id OR g.id = s.target_id
        WHERE g.synaptic_weight < 0.1
        GROUP BY g.id
        HAVING COUNT(s.source_id) = 0 AND COUNT(s.target_id) = 0
      `);
      let orphanedPruned = 0;
      if (doomed && doomed.length > 0) {
        const doomedIds = doomed.map(d => d.id);
        const placeholders = doomedIds.map(() => '?').join(',');
        const delRes = await db.run(`DELETE FROM genome_decisions WHERE id IN (${placeholders})`, ...doomedIds);
        orphanedPruned = delRes?.changes || doomedIds.length;
      }
    }
    return {
      configured: true,
      success: true,
      status: 'completed',
      transport: 'strategy_primitive',
      output: { success: true, prunedSynapses: prunedCount, orphanedDecisionsPruned: orphanedPruned, threshold, agent_id: agentId || 'global' }
    };
  }
  if (toolName === 'genos_trinity_deploy') {
    const cp = require('child_process');
    try {
      const out = runWithTimeout(['trinity', 'deploy', '--mission-id', args.mission_id, '--strategies', args.strategies], timeoutMs);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_allele_frequency_analyzer') {
    const cp = require('child_process');
    try {
      const out = runWithTimeout(['swarm', 'allele-analyzer', '--swarm-id', args.swarm_id], timeoutMs);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_compliance_report') {
    const cp = require('child_process');
    try {
      const out = runWithTimeout(['compliance', 'generate', '--standard', args.standard], timeoutMs);
      const outputPath = resolveMcpOutputPath(args.output_file);
      require('fs').writeFileSync(outputPath, out);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: `Compliance report written to ${outputPath}` };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_strategy_adaptation') {
    const cp = require('child_process');
    try {
      const out = runWithTimeout(['strategy', 'adapt', '--agent-id', args.agent_id, '--constraint', args.constraint, '--target', args.target_value], timeoutMs);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_rebase_compute_plan') {
    const cp = require('child_process');
    const { graph_file, injection_step, injected_keys } = args;
    const keysArgs = injected_keys.flatMap((key) => ['--injected-keys', key]);
    try {
      const out = runWithTimeout(['rebase', 'compute-plan', '--graph-file', graph_file, '--injection-step', String(injection_step), ...keysArgs], timeoutMs);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_guardrails_verify') {
    const cp = require('child_process');
    const { iteration, tokens, elapsed, uncertainty } = args;
    try {
      const out = runWithTimeout(['guardrails', 'verify', '--iteration', String(iteration), '--tokens', String(tokens), '--elapsed', String(elapsed), '--uncertainty', String(uncertainty)], timeoutMs);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_resilience_apoptosis') {
    const cp = require('child_process');
    try {
      const out = runWithTimeout(['resilience', 'apoptosis', '--agent-id', args.agent_id], timeoutMs);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_parasitic_pressure') {
    const cp = require('child_process');
    try {
      const out = runWithTimeout(['eval', 'parasitic-pressure', args.manifest], timeoutMs);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_bisect_agent') {
    const cp = require('child_process');
    try {
      const out = runWithTimeout(['dev', 'bisect-agent', '--agent-id', args.agent_id, '--predicate', args.predicate], timeoutMs);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_biomimicry_hippocampal_consolidate') {
    const cp = require('child_process');
    const episodicMemoryService = require('./episodicMemoryService');
    try {
      const score = Number.isFinite(Number(args.success_score)) ? Number(args.success_score) : 1.0;
      let consolidationResult = null;
      try {
        consolidationResult = await episodicMemoryService.consolidateEpisodes({
          agentId: args.agent_id,
          sessionId: args.session_id,
          scoreThreshold: score >= 0.7 ? score : 0.7,
          purgeBelowThreshold: args.purge_failed !== false
        });
      } catch (err) {
        // Continue even if DB consolidation encounters error
      }
      const episodesCount = consolidationResult?.totalProcessed || 1;
      const steps = (args.dag_step || []).flatMap((step) => ['--param', `dag_step=${step}`]);
      const out = runWithTimeout(['biomimicry', 'bio-feature', '--feature', 'hippocampal', '--action', 'consolidate', '--param', `agent_id=${args.agent_id}`, '--param', `success_score=${score}`, '--param', `episodes_count=${episodesCount}`, ...steps], timeoutMs);
      return {
        configured: true,
        success: true,
        status: 'completed',
        transport: 'local',
        output: out.toString(),
        consolidation: consolidationResult
      };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_hypothesis_evidence') {
    const cp = require('child_process');
    try {
      const command = ['dev', 'hypothesis-evidence', args.diagnosis_id, args.hypothesis_id, '--claim', args.claim, '--source', args.source, '--confidence', String(args.confidence)];
      if (args.artifact) command.push('--artifact', args.artifact);
      if (args.against) command.push('--against');
      const out = runWithTimeout(command, timeoutMs);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_biomimicry_skill_proceduralize') {
    const cp = require('child_process');
    try {
      const cmdParams = ['--param', `skill=${args.skill}`];
      if (args.successes !== undefined) cmdParams.push('--param', `successes=${args.successes}`);
      if (args.failures !== undefined) cmdParams.push('--param', `failures=${args.failures}`);
      if (args.variance !== undefined) cmdParams.push('--param', `variance=${args.variance}`);
      if (args.failure_rate !== undefined) cmdParams.push('--param', `failure_rate=${args.failure_rate}`);
      if (args.steps) args.steps.forEach((step) => cmdParams.push('--param', `step=${step}`));
      if (args.preconditions) args.preconditions.forEach((precondition) => cmdParams.push('--param', `precondition=${precondition}`));
      const out = runWithTimeout(['biomimicry', 'bio-feature', '--feature', 'proceduralization', '--action', args.action, ...cmdParams], timeoutMs);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_biomimicry_gate_evaluate') {
    try {
      let invariantVerified = true;
      let verdict = 'PERMITTED';
      
      // Validation dynamique de l'invariant en backend (Fallback)
      if (args.facts && Array.isArray(args.facts)) {
         for (const fact of args.facts) {
            const factStr = String(fact).toLowerCase();
            if (factStr.includes('error') || factStr.includes('failed') || factStr.includes('violation')) {
                invariantVerified = false;
                verdict = 'DENIED';
                break;
            }
         }
      }

      let cmdParams = [`--param phase=${args.phase}`];
      if (args.facts) args.facts.forEach(f => cmdParams.push(`"${f}"`));
      
      return { 
        configured: true, 
        success: invariantVerified, 
        status: invariantVerified ? 'completed' : 'tool_error', 
        transport: 'local', 
        output: JSON.stringify({
            success: true,
            feature: "gate",
            action: "evaluate",
            params: cmdParams,
            invariant_verified: invariantVerified,
            verdict: verdict
        }) 
      };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  const bioResult = await withTimeout(require('./mcpBioTools').executeBioTool(toolName, args, { timeoutMs }), timeoutMs);
  if (bioResult) return bioResult;
  const stratResult = await withTimeout(require('./mcpStrategyTools').executeStrategyTool(toolName, args, { timeoutMs }), timeoutMs);
  if (stratResult) return stratResult;
  const transport = configuredTransport();

  if (transport?.type === 'invalid') return { configured: false, success: false, status: 'invalid_config', error: transport.error };
  if (!transport) return { configured: false, success: false, status: 'unavailable', error: 'No MCP transport configured. Set GENOS_MCP_URL or GENOS_MCP_COMMAND.' };
  const result = transport.type === 'http'
    ? await callHttp(transport.url, toolName, { args, timeoutMs })
    : await callStdio(transport, toolName, { args, timeoutMs });
  const isError = result.isError === true;
  return { configured: true, success: !isError, status: isError ? 'tool_error' : 'completed', transport: transport.type, output: result.structuredContent ?? result.content ?? result };
}

function checkChromatinLock(agentId, toolName) {
  if (!agentId || !toolName) return null;
  const repositoryRoot = path.resolve(__dirname, '../../..');
  const workspaceRoot = process.env.GENOS_WORKSPACE_ROOT || repositoryRoot;
  const candidateDirs = [
    ...(process.env.GENOS_STUDIO_ROOT ? [path.join(process.env.GENOS_STUDIO_ROOT, 'chromatin')] : []),
    ...(process.env.GENOS_ROOT ? [path.join(process.env.GENOS_ROOT, 'chromatin')] : []),
    path.join(workspaceRoot, '.genos-matrix', 'chromatin'),
    path.join(workspaceRoot, '.genos', 'chromatin'),
    path.join(process.cwd(), '.genos-matrix', 'chromatin'),
    path.join(process.cwd(), '.genos', 'chromatin')
  ];

  let chromatinData = null;
  for (const dir of candidateDirs) {
    const filePath = path.join(dir, `${agentId}.json`);
    if (fs.existsSync(filePath)) {
      try {
        chromatinData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (chromatinData) break;
      } catch (_) {}
    }
  }

  if (!chromatinData) return null;

  const genes = chromatinData.genes || {};
  const normalizedTool = String(toolName).toLowerCase().trim();

  for (const [locus, gene] of Object.entries(genes)) {
    const normLocus = String(locus).toLowerCase().trim();
    const isMatch = normLocus === normalizedTool ||
      normLocus.replace(/^genos_/, '') === normalizedTool.replace(/^genos_/, '') ||
      normalizedTool.includes(normLocus) ||
      normLocus.includes(normalizedTool);

    if (isMatch) {
      const isLocked = gene.developmentally_locked === true ||
        (gene.chromatin_state && String(gene.chromatin_state).toLowerCase() !== 'euchromatin');
      if (isLocked) {
        return {
          locked: true,
          locus,
          chromatinState: gene.chromatin_state,
          developmentallyLocked: gene.developmentally_locked,
          reason: 'Tool locked in heterochromatin'
        };
      }
    }
  }

  return null;
}

async function execute({ agentId, toolName, args = {}, taints = [] }) {
  const db = await getDatabase();
  const scopeRow = agentId ? await db.get('SELECT w.organization_id, w.project_id FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?', agentId) : null;
  const circuitScope = scopeRow?.organization_id && scopeRow?.project_id ? `${scopeRow.organization_id}:${scopeRow.project_id}` : 'global';

  // Chromatin state validation: if agent has this locus locked in heterochromatin, deny execution.
  if (agentId) {
    const chromatinLock = checkChromatinLock(agentId, toolName);
    if (chromatinLock) {
      const reason = chromatinLock.reason || 'Tool locked in heterochromatin';
      await db.run(
        'INSERT INTO audit_logs (actor,agent_id,action,resource,decision,reason,payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
        agentId, agentId, 'WORKFLOW_TOOL_CALL', toolName, 'deny', reason,
        JSON.stringify({ args, taints, chromatin: chromatinLock })
      );
      telemetry.emitEvent({
        eventType: 'WORKFLOW_MCP_TOOL_FAILED',
        agentId,
        action: 'MCP_EXECUTE',
        detail: `Tool '${toolName}' blocked: ${reason}.`,
        severity: 'warning',
        payload: { toolName, args, chromatin: chromatinLock }
      });
      return {
        success: false,
        status: 'deny',
        error: reason,
        reason,
        policy: { decision: 'deny', reason }
      };
    }
  }

  const permissionRow = await db.get('SELECT * FROM agent_permissions WHERE agent_id = ?', agentId);
  const permissions = permissionRow ? JSON.parse(permissionRow.permissions_json || '[]') : [];
  const deniedTools = permissionRow ? JSON.parse(permissionRow.denied_tools_json || '[]') : [];
  const policy = platformSafety.validateToolCall({ agentId, toolName, args, permissions, deniedTools, taints });
  await db.run('INSERT INTO audit_logs (actor,agent_id,action,resource,decision,reason,payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)', agentId, agentId, 'WORKFLOW_TOOL_CALL', toolName, policy.decision, policy.reason, JSON.stringify({ args, taints, policy }));
  if (policy.decision !== 'allow') return { success: false, status: policy.decision, policy };
  const tool = await db.get('SELECT * FROM mcp_tools WHERE name = ?', toolName);
  if (!tool && !require('./mcpStrategyTools').isStrategyTool(toolName)) return { success: false, status: 'not_found', error: `Unknown MCP tool: ${toolName}` };
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
  return registry.declaredToolNames().map((name) => ({ name, description: `GenOS MCP tool '${name}'.`, inputSchema: { type: 'object' } }));
}

async function callTool(toolName, args = {}, timeoutMs = DEFAULT_MCP_TIMEOUT_MS) {
  const result = await executeConfiguredTransport({ toolName, args, timeoutMs: normalizeMcpTimeout(timeoutMs) });
  if (!result.success) throw new Error(result.error || result.output || `MCP tool '${toolName}' failed.`);
  return result.output;
}

module.exports = { execute, executeConfiguredTransport, configuredTransport, checkChromatinLock, normalizeMcpTimeout, listTools, callTool, mcpTransportEnvironment, validateMcpUrl, resolveMcpOutputPath };
