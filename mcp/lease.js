export function parseLease(value) {
  if (value === undefined || value === null) return null;
  const lease = String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.startsWith("genos_") ? entry : `genos_${entry}`);
  return new Set(lease);
}

function parseToolSet(value) {
  if (!value) return new Set();
  return new Set(String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.startsWith("genos_") ? entry : `genos_${entry}`));
}

function allowsUnsafeExposure(environment) {
  return /^(1|true|yes)$/i.test(String(environment.GENOS_MCP_ALLOW_UNSAFE_EXPOSE_ALL || '').trim());
}

function exposeAllEnabled(environment) {
  const exposeFlag = !/^(0|false)$/i.test(environment.GENOS_MCP_EXPOSE_ALL || '');
  if (!exposeFlag) return false;
  if (String(environment.NODE_ENV || '').toLowerCase() !== 'production') return true;
  return allowsUnsafeExposure(environment);
}

export function toolIsLeased(toolName, allTools, environment = process.env) {
  if (environment.GENOS_MCP_LEASE_EXPIRES_AT) {
    const expiresAt = Number(environment.GENOS_MCP_LEASE_EXPIRES_AT);
    if (!Number.isNaN(expiresAt) && Date.now() > expiresAt) return false;
  }
  const lease = parseLease(environment.GENOS_MCP_LEASE);
  const disabled = parseToolSet(environment.GENOS_MCP_DISABLED_TOOLS);
  if (disabled.has(toolName)) return false;
  if (lease !== null) return allTools.some((tool) => tool.name === toolName) && lease.has(toolName);
  if (exposeAllEnabled(environment)) return allTools.some((tool) => tool.name === toolName);
  return toolName === allTools[0]?.name;
}

export function filterLeasedTools(allTools, environment = process.env) {
  return allTools.filter((tool) => toolIsLeased(tool.name, allTools, environment));
}
