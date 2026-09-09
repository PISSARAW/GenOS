function handleEnzymeCatalyze(args, run) {
  const out = run(`genos biomimicry enzyme-catalyze --enzyme "${args.enzyme_name}" --signature "${args.substrate_signature}" --payload "${args.payload}"`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleEnzymeCatalyzeError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
}

module.exports = { handleEnzymeCatalyze, handleEnzymeCatalyzeError };
