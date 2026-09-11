const { quoteCliArg } = require('../shellQuote');

function handleEpigeneticChromatin(args, run) {
  const out = run(`genos biomimicry epigenetic-chromatin --agent-id ${quoteCliArg(args.agent_id)} --locus ${quoteCliArg(args.locus)} --state ${quoteCliArg(args.state)}`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleEpigeneticChromatinError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleEpigeneticChromatin, handleEpigeneticChromatinError };
