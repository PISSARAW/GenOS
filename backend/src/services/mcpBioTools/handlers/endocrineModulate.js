const { quoteCliArg } = require('../shellQuote');

function handleEndocrineModulate(args, run) {
  let cmdParams = [`--param endocrine_action=${quoteCliArg(args.endocrine_action)}`];
  if (args.swarm_id) cmdParams.push(`--param swarm_id=${quoteCliArg(args.swarm_id)}`);
  if (args.endocrine_action === 'secrete') {
    cmdParams.push(`--param hormone=${quoteCliArg(args.hormone)}`, `--param amount=${quoteCliArg(args.amount)}`);
  } else if (args.endocrine_action === 'decay') {
    cmdParams.push(`--param decay_factor=${quoteCliArg(args.decay_factor)}`);
  }
  const cmd = `genos biomimicry bio-feature --feature endocrine --action modulate ${cmdParams.join(' ')}`;
  const out = run(cmd);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleEndocrineModulateError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleEndocrineModulate, handleEndocrineModulateError };
