const cp = require('child_process');
const genosCli = require('./genosCli');
function runGenosSync(command, timeoutMs) {
  return genosCli.runGenosSync(command, { timeoutMs });
}
const { getDatabase } = require('../db');
const { terminateChild } = require('./processTermination');
const { TOOL_HANDLERS } = require('./handlers');

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

async function executeBioTool(toolName, args, options = {}) {
  const timeoutMs = Math.max(1, Number(options.timeoutMs) || 30000);
  const run = (command) => runGenosSync(command, timeoutMs);
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
        const result = require('./handlers/echolocation').handleEcholocationListen(args, cp, getDatabase, run);
        return result;
      }
      const result = require('./handlers/echolocation').handleEcholocationBeep(args, cp, run);
      return result;
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
    }
  }
  return require('./mcpBioExtra').executeBioExtra(toolName, args, { timeoutMs });
}

module.exports = { executeBioTool, stopEcholocation };
