export function parseLease(value) {
  if (!value) return null;
  const lease = String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.startsWith("genos_") ? entry : `genos_${entry}`);
  return lease.length ? new Set(lease) : null;
}

function parseToolSet(value) {
  if (!value) return new Set();
  return new Set(String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.startsWith("genos_") ? entry : `genos_${entry}`));
}

export function toolIsLeased(toolName, allTools, environment = process.env) {
  const lease = parseLease(environment.GENOS_MCP_LEASE);
  const disabled = parseToolSet(environment.GENOS_MCP_DISABLED_TOOLS);
  const exposeAll = !/^(0|false)$/i.test(environment.GENOS_MCP_EXPOSE_ALL || '');
  if (disabled.has(toolName)) return false;
  if (lease) return allTools.some((tool) => tool.name === toolName) && lease.has(toolName);
  if (exposeAll) return allTools.some((tool) => tool.name === toolName);
  return toolName === allTools[0]?.name;
}

export function filterLeasedTools(allTools, environment = process.env) {
  return allTools.filter((tool) => toolIsLeased(tool.name, allTools, environment));
}
