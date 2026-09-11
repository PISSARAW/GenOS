const { quoteCliArg } = require('../shellQuote');

function handleEntericDelegate(args, run) {
  const out = run(`genos biomimicry enteric-delegate --agent-id ${quoteCliArg(args.agent_id)} --data-source ${quoteCliArg(args.data_source)}` + (args.digestion_mode ? ` --digestion-mode ${quoteCliArg(args.digestion_mode)}` : ''));
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleEntericDelegateError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleEntericDelegate, handleEntericDelegateError };
