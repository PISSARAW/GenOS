function handleActiveSensing(args, run) {
  const cmdParams = [`--param focus="${args.focus}"`, `--param ambiguity=${args.ambiguity}`];
  const cmd = `genos biomimicry bio-feature --feature active_sensing --action emit ${cmdParams.join(' ')}`;
  const out = run(cmd);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleActiveSensingError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleActiveSensing, handleActiveSensingError };
