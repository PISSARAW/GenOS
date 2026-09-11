const { quoteCliArg } = require('../shellQuote');

function handleCheckpointGate(args, run) {
  let cmdParams = [];
  if (args.signal) {
    cmdParams.push('--param action=signal', `--param choice=${quoteCliArg(args.signal)}`);
  } else {
    cmdParams.push('--param action=freeze', `--param ambiguity=${quoteCliArg(args.ambiguity)}`, `--param opt_a=${quoteCliArg(args.option_a)}`, `--param opt_b=${quoteCliArg(args.option_b)}`);
  }
  const cmd = `genos biomimicry bio-feature --feature checkpoint --action gate ${cmdParams.join(' ')}`;
  const out = run(cmd);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleCheckpointGateError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleCheckpointGate, handleCheckpointGateError };
