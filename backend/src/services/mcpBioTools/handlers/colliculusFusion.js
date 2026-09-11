const { quoteCliArg } = require('../shellQuote');

function handleColliculusFusion(args, run) {
  const out = run(`genos biomimicry colliculus-fusion --agent-id ${quoteCliArg(args.agent_id)} --signals ${quoteCliArg(args.signals_json)}`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleColliculusFusionError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleColliculusFusion, handleColliculusFusionError };
