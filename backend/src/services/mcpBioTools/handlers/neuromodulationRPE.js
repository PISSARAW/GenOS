const { quoteCliArg } = require('../shellQuote');

function handleNeuromodulationRPE(args, run) {
  const cmdParams = [`--param node_id=${quoteCliArg(args.node_id)}`, `--param expected_reward=${quoteCliArg(args.expected_reward)}`, `--param actual_reward=${quoteCliArg(args.actual_reward)}`];
  const cmd = `genos biomimicry bio-feature --feature neuromodulation --action rpe ${cmdParams.join(' ')}`;
  const out = run(cmd);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleNeuromodulationRPError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleNeuromodulationRPE, handleNeuromodulationRPError };
