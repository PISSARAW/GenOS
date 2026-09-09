function handleNetworkQuorum(args, run) {
  const out = run(`genos biomimicry network-quorum --agent-id ${args.agent_id} --threshold ${args.quorum_threshold} --action-id "${args.action_id}"`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleNetworkQuorumError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleNetworkQuorum, handleNetworkQuorumError };
