const { quoteCliArg } = require('../shellQuote');

function handleCircadianReset(args, run) {
  const out = run(`genos biomimicry circadian-reset --agent-id ${quoteCliArg(args.agent_id)} --signal ${quoteCliArg(args.zeitgeber_signal)}`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleCircadianResetError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleCircadianReset, handleCircadianResetError };
