const path = require('path');
const { runGenosSync } = require('../genosCli');
const { resolveContainedPathNoSymlinkSync } = require('../pathSafety');
const { validateToolArguments } = require('../mcpArgumentValidation');
const { callHttpFn } = require('./transports/http');
const { callStdioFn } = require('./transports/stdio');
const { executeToolLogic } = require('./transports/toolLogic');
const { getToolRegistry, directToolLeaseAllows, configuredTransport } = require('./config');

const WORKSPACE_FALLBACK = path.resolve(__dirname, '../../../..');

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
  const root = path.resolve(process.env.GENOS_WORKSPACE_ROOT || WORKSPACE_FALLBACK);
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
      resolveContainedPathNoSymlinkSync(path.resolve(process.env.GENOS_WORKSPACE_ROOT || WORKSPACE_FALLBACK), args[field], field);
    } catch (_) {
      throw Object.assign(new Error(`${field} must remain inside the GenOS workspace and avoid symlinks.`), { code: 'INVALID_INPUT_PATH' });
    }
  }
}

function invalidToolResult() {
  return { configured: false, success: false, status: 'invalid_tool', error: 'toolName is required.' };
}

function unsupportedResult(toolName, executionKind) {
  return { configured: false, success: false, status: 'unsupported', error: `Tool '${toolName}' is not supported by the runtime dispatch registry.`, executionKind };
}

function leaseDeniedResult(toolName, executionKind) {
  return { configured: false, success: false, status: 'lease_denied', error: `Tool '${toolName}' is outside the active MCP lease.`, code: 'MCP_TOOL_LEASE_DENIED', executionKind };
}

function invalidArgsResult(error) {
  return { configured: false, success: false, status: 'invalid_args', error: error.message, code: error.code };
}

function invalidConfigResult(transport) {
  return { configured: false, success: false, status: 'invalid_config', error: transport.error };
}

function preValidateTool(context) {
  const { registry, toolName, args, executionKind } = context;
  if (!registry.isSupportedTool(toolName)) return unsupportedResult(toolName, executionKind);
  if (!directToolLeaseAllows(toolName)) return leaseDeniedResult(toolName, executionKind);
  const argumentError = validateToolArguments(toolName, args);
  if (argumentError) return invalidArgsResult(argumentError);
  try {
    validateMcpInputPaths(args);
  } catch (error) {
    return invalidArgsResult(error);
  }
  return null;
}

function hasConfiguredEndpoint() {
  return Boolean(process.env.GENOS_MCP_URL || process.env.GENOS_MCP_ENDPOINT || process.env.GENOS_MCP_COMMAND);
}

function normalizeTransportOutput(result) {
  if (result.structuredContent !== undefined && result.structuredContent !== null) return result.structuredContent;
  if (result.content !== undefined && result.content !== null) return result.content;
  return result;
}

function bufferText(value) {
  if (!value) return '';
  return Buffer.isBuffer(value) ? value.toString() : String(value);
}

function runLocalCommand(commandLine, timeoutMs) {
  try {
    return { configured: true, success: true, status: 'completed', transport: 'local', output: runSafeSync(commandLine, { timeoutMs }).toString() };
  } catch (error) {
    const isTimeout = error.code === 'ETIMEDOUT' || error.signal === 'SIGTERM';
    const output = bufferText(error.stdout) || bufferText(error.stderr) || error.message;
    return { configured: true, success: false, status: isTimeout ? 'timeout' : 'tool_error', transport: 'local', output };
  }
}

function createLocalRunner(timeoutMs) {
  return (commandLine) => {
    return runLocalCommand(commandLine, timeoutMs);
  };
}

async function executeRemoteTransport(toolName, args, timeoutMs) {
  const transport = configuredTransport();
  if (transport && transport.type === 'invalid') return invalidConfigResult(transport);
  const result = transport.type === 'http'
    ? await callHttpFn(transport.url, toolName, { args, timeoutMs })
    : await callStdioFn(transport, toolName, { args, timeoutMs });
  const isError = result.isError === true;
  return {
    configured: true,
    success: !isError,
    status: isError ? 'tool_error' : 'completed',
    transport: transport.type,
    output: normalizeTransportOutput(result)
  };
}

async function executeConfiguredTransport({ toolName, args = {}, timeoutMs = 30000, preValidated = false }) {
  const registry = getToolRegistry();
  const normalizedToolName = String(toolName || '').trim();
  const executionKind = registry.detectExecutionKind(normalizedToolName);
  if (!normalizedToolName) return invalidToolResult();
  if (!preValidated) {
    const rejection = preValidateTool({ registry, toolName: normalizedToolName, args, executionKind });
    if (rejection) return rejection;
  }
  if (hasConfiguredEndpoint()) return executeRemoteTransport(normalizedToolName, args, timeoutMs);
  const runLocal = createLocalRunner(timeoutMs);
  return executeToolLogic(toolName, args, { runLocal, timeoutMs });
}

async function listTools() {
  const registry = getToolRegistry();
  const { getToolInputSchema } = require('../mcpContract');
  return registry.declaredToolNames().map((name) => ({ name, description: `GenOS MCP tool '${name}'.`, inputSchema: getToolInputSchema(name) }));
}

module.exports = {
  runSafeSync,
  runWithTimeout,
  resolveMcpOutputPath,
  validateMcpInputPaths,
  executeConfiguredTransport,
  listTools
};
