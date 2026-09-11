const { quoteCliArg } = require('../shellQuote');

function handleTheoryAutopoiesis(args, run) {
  const out = run(`genos biomimicry theory-autopoiesis --agent-id ${quoteCliArg(args.agent_id)} --target-gene ${quoteCliArg(args.target_gene)} --new-value ${quoteCliArg(args.new_value)}`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleTheoryAutopoiesisError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleTheoryAutopoiesis, handleTheoryAutopoiesisError };
