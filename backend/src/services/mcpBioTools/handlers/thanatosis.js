const { quoteCliArg } = require('../shellQuote');

function handleThanatosis(args, run) {
  let cmdParams = [`--param action=${quoteCliArg(args.action)}`, `--param agent_id=${quoteCliArg(args.agent_id)}`];
  if (args.threat_source) cmdParams.push(`--param threat_source=${quoteCliArg(args.threat_source)}`);
  const cmd = `genos biomimicry bio-feature --feature behavior --action thanatosis ${cmdParams.join(' ')}`;
  const out = run(cmd);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleThanatosisError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleThanatosis, handleThanatosisError };
