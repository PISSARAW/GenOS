const { quoteCliArg } = require('../shellQuote');

function handleCryptobiosis(args, run) {
  const out = run(`genos resilience cryptobiosis --agent-id ${quoteCliArg(args.agent_id)}` + (args.duration ? ` --duration ${quoteCliArg(args.duration)}` : ''));
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleCryptobiosisError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleCryptobiosis, handleCryptobiosisError };
