const { quoteCliArg } = require('../shellQuote');

function handleSwarmConsensus(args, run) {
  const agentId = args.agent_id || 'swarm_agent';
  const threshold = args.quorum_threshold || 0.66;
  const actionId = args.proposal || args.action_id || 'swarm_consensus';
  const out = run(`genos biomimicry network-quorum --agent-id ${quoteCliArg(agentId)} --threshold ${quoteCliArg(threshold)} --action-id ${quoteCliArg(actionId)}`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleSwarmConsensusError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleSwarmConsensus, handleSwarmConsensusError };
