const fs = require('fs');
const path = require('path');
const circuitBreaker = require('../circuitBreaker');
const { validateToolArguments } = require('../mcpArgumentValidation');

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
  if (process.env.GENOS_MCP_LEASE_EXPIRES_AT) {
    const expiresAt = Number(process.env.GENOS_MCP_LEASE_EXPIRES_AT);
    if (!Number.isNaN(expiresAt) && Date.now() > expiresAt) return false;
  }
  const disabled = String(process.env.GENOS_MCP_DISABLED_TOOLS || '').split(',').map((name) => name.trim()).filter(Boolean);
  if (disabled.includes(toolName)) return false;
  const leaseEnv = process.env.GENOS_MCP_LEASE;
  if (leaseEnv === undefined || leaseEnv === null) return true;
  const lease = String(leaseEnv).split(',').map((name) => name.trim()).filter(Boolean);
  return lease.length === 0 ? false : lease.includes(toolName);
}

function getToolRegistry() {
  return require('../mcpToolRegistry');
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

function parseArgs(value) {
  const args = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escape = false;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (escape) {
      current += ch;
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if ((ch === ' ' || ch === '\t') && !inSingle && !inDouble) {
      if (current.length) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current.length) args.push(current);
  return args;
}

function configuredTransport() {
  const url = process.env.GENOS_MCP_URL || process.env.GENOS_MCP_ENDPOINT;
  const command = process.env.GENOS_MCP_COMMAND;
  if (url) {
    const error = validateMcpUrl(url);
    return error ? { type: 'invalid', error } : { type: 'http', url };
  }
  if (command) return { type: 'stdio', command, args: parseArgs(process.env.GENOS_MCP_ARGS || '') };
  const mcpIndex = path.resolve(__dirname, '../../../../mcp/index.js');
  if (fs.existsSync(mcpIndex)) return { type: 'stdio', command: process.execPath, args: [mcpIndex], bundled: true };
  const bundledRelease = path.resolve(__dirname, '../../../../target/release/genos-mcp');
  if (fs.existsSync(bundledRelease)) return { type: 'stdio', command: bundledRelease, args: ['stdio'], bundled: true };
  if (fs.existsSync(`${bundledRelease}.exe`)) return { type: 'stdio', command: `${bundledRelease}.exe`, args: ['stdio'], bundled: true };
  const bundled = path.resolve(__dirname, '../../../../target/debug/genos-mcp');
  if (fs.existsSync(bundled)) return { type: 'stdio', command: bundled, args: ['stdio'], bundled: true };
  if (fs.existsSync(`${bundled}.exe`)) return { type: 'stdio', command: `${bundled}.exe`, args: ['stdio'], bundled: true };
  return null;
}

module.exports = {
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
};
