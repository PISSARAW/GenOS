const { quoteCliArg } = require('../shellQuote');

function handleCellularEndosymbiosis(args, run) {
  const out = run(`genos biomimicry cellular-endosymbiosis --agent-id ${quoteCliArg(args.agent_id)} --target-process ${quoteCliArg(args.target_process)} --organelle-name ${quoteCliArg(args.organelle_name)}`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleCellularEndosymbiosisError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleCellularEndosymbiosis, handleCellularEndosymbiosisError };
