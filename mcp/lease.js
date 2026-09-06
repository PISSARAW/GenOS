export function parseLease(value) {
  if (!value) return null;
  const lease = String(value).split(",").map((entry) => entry.trim()).filter(Boolean);
  return lease.length ? new Set(lease) : null;
}

export function toolIsLeased(toolName, allTools, environment = process.env) {
  const lease = parseLease(environment.GENOS_MCP_LEASE);
  const exposeAll = /^(1|true)$/i.test(environment.GENOS_MCP_EXPOSE_ALL || "");
  if (!lease) return exposeAll || toolName === allTools[0]?.name;
  return allTools.some((tool) => tool.name === toolName)
    && [...lease].some((entry) => entry === toolName || toolName === `genos_${entry}`);
}

export function filterLeasedTools(allTools, environment = process.env) {
  return allTools.filter((tool) => toolIsLeased(tool.name, allTools, environment));
}
