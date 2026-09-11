const { quoteCliArg } = require('../shellQuote');

function handleFlockingExplore(args, run) {
  const out = run(`genos biomimicry flocking-explore --agent-id ${quoteCliArg(args.agent_id)} --zone ${quoteCliArg(args.target_zone)}` + (args.alignment_strength ? ` --alignment ${quoteCliArg(args.alignment_strength)}` : ''));
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleFlockingExploreError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleFlockingExplore, handleFlockingExploreError };
