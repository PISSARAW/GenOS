function handleReflexArc(args, run) {
  const out = run(`genos biomimicry reflex-arc --agent-id ${args.agent_id} --stimulus "${args.stimulus_type}" --payload "${args.intensity_or_signal}"`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleReflexArcError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleReflexArc, handleReflexArcError };
