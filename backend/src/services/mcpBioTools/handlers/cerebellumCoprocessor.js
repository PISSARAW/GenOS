function handleCerebellumCoprocessor(args, run) {
  const out = run(`genos biomimicry cerebellum-coprocessor --agent-id ${args.agent_id} --target-value ${args.target_value} --expected-latency ${args.expected_latency} --current-value ${args.current_value} --actual-latency ${args.actual_latency}`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleCerebellumCoprocessorError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleCerebellumCoprocessor, handleCerebellumCoprocessorError };
