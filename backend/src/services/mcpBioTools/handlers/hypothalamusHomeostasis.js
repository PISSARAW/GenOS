function handleHypothalamusHomeostasis(args, run) {
  const out = run(`genos biomimicry hypothalamus-homeostasis --agent-id ${args.agent_id} --nervous-state ${args.nervous_state}`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleHypothalamusHomeostasisError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleHypothalamusHomeostasis, handleHypothalamusHomeostasisError };
