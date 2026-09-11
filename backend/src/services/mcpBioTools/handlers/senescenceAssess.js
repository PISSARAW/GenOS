const { quoteCliArg } = require('../shellQuote');

function handleSenescenceAssess(args, run) {
  const out = run(`genos biomimicry senescence-assess --agent-id ${quoteCliArg(args.agent_id)} --context-age ${quoteCliArg(args.context_age)}`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleSenescenceAssessError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleSenescenceAssess, handleSenescenceAssessError };
