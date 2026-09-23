/**
 * Catalogue HCL : enregistre les exécuteurs historiques comme drivers.
 * Point unique de délégation pour `configuredExecutable`, avec fallback
 * legacy si le registre ne connaît pas le nom demandé.
 */
const registry = require('./harnessRegistry');
const callerMcp = require('./harnessDrivers/callerMcpDriver');
const codex = require('./harnessDrivers/codexDriver');
const local = require('./harnessDrivers/localDriver');
const solar = require('./harnessDrivers/solarDriver');

function ensureDefaults() {
  if (registry.listHarnesses().length) return registry.listHarnesses();
  registry.registerHarness({ name: 'caller_mcp', capabilities: callerMcp.capabilities(), driver: callerMcp });
  registry.registerHarness({ name: 'codex', capabilities: codex.capabilities(), driver: codex });
  registry.registerHarness({ name: 'local', capabilities: local.capabilities(), driver: local });
  registry.registerHarness({ name: 'solar-direct', capabilities: solar.capabilities(), driver: solar });
  return registry.listHarnesses();
}

function harnessRuntime(name) {
  ensureDefaults();
  try {
    return registry.getHarness(name).driver.runtimePath();
  } catch (_) {
    return null;
  }
}

module.exports = { ensureDefaults, harnessRuntime };
