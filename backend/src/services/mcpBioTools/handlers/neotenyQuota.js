const { quoteCliArg } = require('../shellQuote');

function handleNeotenyQuota(args, run) {
  let cmdParams = [`--param total_agents=${quoteCliArg(args.total_agents)}`, `--param neotenic_agents=${quoteCliArg(args.neotenic_agents)}`, `--param request=${quoteCliArg(args.request)}`];
  if (args.fraction !== undefined) cmdParams.push(`--param fraction=${quoteCliArg(args.fraction)}`);
  const cmd = `genos biomimicry bio-feature --feature neoteny --action quota ${cmdParams.join(' ')}`;
  const out = run(cmd);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleNeotenyQuotaError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleNeotenyQuota, handleNeotenyQuotaError };
