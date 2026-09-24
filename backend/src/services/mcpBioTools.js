const cp = require('child_process');
const genosCli = require('./genosCli');
function runGenosSync(command, timeoutMs) {
  return genosCli.runGenosSync(command, { timeoutMs });
}
const { getDatabase } = require('../db');
const { terminateChild } = require('./processTermination');
const { TOOL_HANDLERS } = require('./mcpBioTools/handlers');

let echolocationProcess = null;
let echolocationProcessId = null;

function stopEcholocation() {
  if (!echolocationProcess) return false;
  terminateChild(echolocationProcess);
  echolocationProcess = null;
  if (echolocationProcessId) getDatabase().then((db) => db.run('DELETE FROM detached_processes WHERE id = ?', echolocationProcessId)).catch(() => {});
  echolocationProcessId = null;
  return true;
}

function revalidateBioCall(toolName, args) {
  const { directToolLeaseAllows } = require('./mcpExecutor/config');
  const { validateToolArguments } = require('./mcpArgumentValidation');
  if (!directToolLeaseAllows(toolName)) {
    return { configured: false, success: false, status: 'lease_denied', error: `Tool '${toolName}' is outside the active MCP lease.`, code: 'MCP_TOOL_LEASE_DENIED' };
  }
  const argumentError = validateToolArguments(toolName, args || {});
  if (argumentError) {
    return { configured: true, success: false, status: 'invalid_args', error: argumentError.message, code: argumentError.code };
  }
  const circuit = require('./circuitBreaker').canExecute(toolName, 'operator', 'global', args);
  if (!circuit.allowed) {
    return { configured: true, success: false, status: 'circuit_open', error: circuit.message, code: circuit.reason || 'MCP_CIRCUIT_OPEN' };
  }
  return null;
}

async function executeBioTool(toolName, args, options = {}) {
  const timeoutMs = Math.max(1, Number(options.timeoutMs) || 30000);
  const run = (command) => runGenosSync(command, timeoutMs);
  // Fail-closed re-validation: never trust preValidated callers. Lease, args
  // and circuit are re-checked here even when dispatch already validated.
  const rejection = revalidateBioCall(toolName, args);
  if (rejection) return rejection;
  const handler = TOOL_HANDLERS[toolName];
  if (handler) {
    try {
      return await handler.handle(args, run);
    } catch (e) {
      return handler.error(e);
    }
  }
  if (toolName === 'genos_biomimicry_echolocation') {
    try {
      if (args.action === 'listen') {
        const result = require('./mcpBioTools/handlers/echolocation').handleEcholocationListen(args, cp, getDatabase, run);
        return result;
      }
      const result = require('./mcpBioTools/handlers/echolocation').handleEcholocationBeep(args, cp, run);
      return result;
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
    }
  }
  // Explicit extra route (single source of truth): genos_biomimicry_distributed_huddle
  // and genos_biomimicry_axolotl_* are served by mcpBioExtra, not TOOL_HANDLERS.
  return require('./mcpBioExtra').executeBioExtra(toolName, args, { timeoutMs });
}

function isBioTool(toolName) {
  const name = String(toolName || '').trim();
  if (!name) return false;
  if (TOOL_HANDLERS[name] || name === 'genos_biomimicry_echolocation') return true;
  try {
    const { isBioExtraTool } = require('./mcpBioExtra');
    if (isBioExtraTool(name)) return true;
  } catch (_) {}
  return false;
}

module.exports = { executeBioTool, stopEcholocation, isBioTool };
