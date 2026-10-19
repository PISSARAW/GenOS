const toolCatalog = require('../../../../shared/toolDefinitions.json');
const { assertActionGenome } = require('./actionGenomeValidator');
const { getSurfaceBindings } = require('./actionGenomeCatalog');

function mcpProjection(genome, binding) {
  if (!binding?.tool) return descriptive('mcp', 'Aucun outil MCP lié.');
  const tool = toolCatalog.tools.find((candidate) => candidate.name === binding.tool);
  const leased = genome.authority.leases.includes(binding.tool);
  if (!tool || !leased) return descriptive('mcp', 'La liaison MCP ne correspond pas au catalogue et au lease canonique.');
  return {
    surface: 'mcp',
    wired: true,
    mode: 'invoke',
    target: binding.tool,
    fixedArguments: binding.fixedArguments || {},
    inputSchema: tool.inputSchema
  };
}

function descriptive(surface, reason) {
  return { surface, wired: false, mode: 'describe_only', reason };
}

function declaredProjection(surface, binding) {
  if (binding?.status !== 'wired') return descriptive(surface, binding?.reason || `Aucune liaison ${surface}.`);
  return { surface, wired: true, mode: binding.mode, target: binding.target };
}

function projectActionGenome(candidate) {
  const genome = assertActionGenome(candidate);
  const bindings = getSurfaceBindings(genome);
  return {
    schema: 'genos.action-surface-projection/v1',
    action: genome.identity,
    surfaces: [
      mcpProjection(genome, bindings.mcp),
      declaredProjection('rest', bindings.rest),
      declaredProjection('cli', bindings.cli)
    ]
  };
}

module.exports = { projectActionGenome };
