const { quoteCliArg } = require('../shellQuote');

function handleMyceliumNetwork(args, run) {
  const out = run(`genos biomimicry mycelium-network --action ${quoteCliArg(args.action)}`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleMyceliumNetworkError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
}

module.exports = { handleMyceliumNetwork, handleMyceliumNetworkError };
