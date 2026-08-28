const cp = require('child_process');

function executeBioExtra(toolName, args) {
  if (!toolName.startsWith('genos_')) return null;
  // Dynamic exec to reduce cyclomatic complexity
  const known = ['genos_quantitative_genetics', 'genos_coevolution', 'genos_lamarckian_mutation', 'genos_dna_methylation', 'genos_cell_division', 'genos_molecular_chaperone', 'genos_necrosis_ledger', 'genos_multisensory_integration', 'genos_thalamic_filtering', 'genos_social_trust', 'genos_routing_algorithm'];
  if (known.includes(toolName)) {
    try {
      const out = cp.execSync(genos extra  --agent-id );
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
    }
  }
  return null;
}

module.exports = { executeBioExtra };
