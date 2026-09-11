const { quoteCliArg } = require('../shellQuote');

function handleProprioception(args, run) {
  const out = run(`genos biomimicry proprioception --focus ${quoteCliArg(args.focus)}`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleProprioceptionError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
}

module.exports = { handleProprioception, handleProprioceptionError };
