function handleEpigeneticChromatin(args, run) {
  const out = run(`genos biomimicry epigenetic-chromatin --agent-id ${args.agent_id} --locus "${args.locus}" --state ${args.state}`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleEpigeneticChromatinError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleEpigeneticChromatin, handleEpigeneticChromatinError };
