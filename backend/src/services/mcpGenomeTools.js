/**
 * GenOS MCP AgentDNA genome tools.
 *
 * Bridges `genos genome <op>` to the MCP runtime by building a safe command
 * line for the shared local transport. Arguments are quoted and validated so
 * the CLI bridge never sees shell metacharacters.
 */

const REQUIRED = {
  genos_genome_compile: ['input', 'out'],
  genos_genome_validate: ['file'],
  genos_genome_inspect: ['file'],
  genos_genome_cross: ['parent_a', 'parent_b', 'out'],
  genos_genome_mutate: ['input', 'out'],
  genos_genome_clone: ['input', 'out'],
  genos_genome_decoy: ['input', 'out']
};

function isGenomeTool(toolName) {
  return Object.prototype.hasOwnProperty.call(REQUIRED, String(toolName || ''));
}

function quote(value) {
  const cleaned = String(value).replace(/["`]/g, '');
  return '"' + cleaned + '"';
}

function numFlag(flag, value) {
  if (value === undefined || value === null) return '';
  return ' ' + flag + ' ' + Number(value);
}

function strFlag(flag, value) {
  if (value === undefined || value === null || value === '') return '';
  return ' ' + flag + ' ' + quote(value);
}

function buildCommand(toolName, args) {
  if (toolName === 'genos_genome_compile') {
    return 'genos genome compile --in ' + quote(args.input) + ' --out ' + quote(args.out) + ' --force --parents';
  }
  if (toolName === 'genos_genome_validate') {
    return 'genos genome validate --file ' + quote(args.file);
  }
  if (toolName === 'genos_genome_inspect') {
    return 'genos genome inspect --file ' + quote(args.file);
  }
  if (toolName === 'genos_genome_cross') {
    return 'genos genome cross --parent-a ' + quote(args.parent_a) + ' --parent-b ' + quote(args.parent_b)
      + ' --out ' + quote(args.out) + ' --force --parents'
      + numFlag('--swap-prob', args.swap_prob) + numFlag('--point', args.point)
      + strFlag('--seed', args.seed) + numFlag('--speciation-threshold', args.speciation_threshold);
  }
  if (toolName === 'genos_genome_mutate') {
    return 'genos genome mutate --in ' + quote(args.input) + ' --out ' + quote(args.out) + ' --force --parents'
      + numFlag('--rate', args.rate) + strFlag('--locus', args.locus) + strFlag('--seed', args.seed)
      + (args.hyper ? ' --hyper' : '');
  }
  if (toolName === 'genos_genome_clone') {
    return 'genos genome clone --in ' + quote(args.input) + ' --out ' + quote(args.out) + ' --force --parents'
      + strFlag('--mode', args.mode) + numFlag('--daughter-volume', args.daughter_volume)
      + numFlag('--mutation-rate', args.mutation_rate) + strFlag('--seed', args.seed);
  }
  return 'genos genome decoy --in ' + quote(args.input) + ' --out ' + quote(args.out) + ' --force --parents'
    + strFlag('--selector', args.selector) + numFlag('--detectability', args.detectability);
}

function missingFields(toolName, args) {
  return REQUIRED[toolName].filter((field) => {
    const value = args[field];
    return value === undefined || value === null || value === '';
  });
}

async function executeGenomeTool(toolName, args, runLocal) {
  if (!isGenomeTool(toolName)) return null;
  const provided = args || {};
  const missing = missingFields(toolName, provided);
  if (missing.length) {
    return {
      configured: true,
      success: false,
      status: 'invalid_args',
      transport: 'local',
      error: 'Missing required argument(s): ' + missing.join(', ')
    };
  }
  return runLocal(buildCommand(toolName, provided));
}

module.exports = { isGenomeTool, executeGenomeTool, buildCommand, REQUIRED };
