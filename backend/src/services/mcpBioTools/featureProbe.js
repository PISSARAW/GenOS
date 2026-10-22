function probeBioFeature(run, command) {
  if (typeof run !== 'function') return { cliOutput: null, cliFailed: false, cliErrorText: null };
  try {
    const out = run(command);
    return { cliOutput: out ? out.toString() : null, cliFailed: false, cliErrorText: null };
  } catch (error) {
    const cliErrorText = error && error.message ? error.message : String(error);
    if (isUnsupportedStatusFeature(command, cliErrorText)) {
      return { cliOutput: null, cliFailed: false, cliErrorText: null };
    }
    return { cliOutput: null, cliFailed: true, cliErrorText };
  }
}

function isUnsupportedStatusFeature(command, errorText) {
  const isStatus = /(?:^|\s)--action\s+["']?status["']?(?:\s|$)/.test(command);
  return isStatus && /Unknown biomimicry feature/.test(errorText);
}

module.exports = { probeBioFeature };