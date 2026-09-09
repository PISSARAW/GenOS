function handleSpeciationCheck(args, run) {
  const out = run(`genos biomimicry speciation-check --agent-id ${args.agent_id}` + (args.divergence_threshold ? ` --threshold ${args.divergence_threshold}` : ''));
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleSpeciationCheckError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleSpeciationCheck, handleSpeciationCheckError };
