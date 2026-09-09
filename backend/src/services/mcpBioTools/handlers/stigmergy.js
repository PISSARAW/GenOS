function handleStigmergy(args, run) {
  const action = String(args.action || 'deposit').toLowerCase();
  let cmd;
  if (action === 'read') {
    cmd = `genos biomimicry stigmergy-read --agent-id ${args.agent_id} --target-file "${args.target_file}"`;
  } else if (action === 'evaporate') {
    cmd = `genos biomimicry stigmergy-evaporate --agent-id ${args.agent_id}`;
    if (args.dt_seconds !== undefined) cmd += ` --dt-seconds ${args.dt_seconds}`;
  } else {
    cmd = `genos biomimicry stigmergy-deposit --agent-id ${args.agent_id} --target-file "${args.target_file}" --pheromone-type "${args.pheromone_type || 'trace'}"`;
    if (args.amount !== undefined) cmd += ` --amount ${args.amount}`;
    if (args.is_repellent || args.isRepellent) cmd += ` --is-repellent`;
  }
  const out = run(cmd);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleStigmergyError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleStigmergy, handleStigmergyError };
