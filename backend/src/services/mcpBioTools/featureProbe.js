function probeBioFeature(run, command) {
  if (typeof run !== 'function') return { cliOutput: null, cliFailed: false, cliErrorText: null };
  try {
    const out = run(command);
    return { cliOutput: out ? out.toString() : null, cliFailed: false, cliErrorText: null };
  } catch (error) {
    return { cliOutput: null, cliFailed: true,
      cliErrorText: error && error.message ? error.message : String(error) };
  }
}

module.exports = { probeBioFeature };
