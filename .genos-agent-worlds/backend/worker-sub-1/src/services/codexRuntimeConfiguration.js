function commandOptions(mission = {}, environment = process.env) {
  const model = String(mission.codexModel || environment.GENOS_CODEX_MODEL || '').trim();
  const reasoningEffort = String(
    mission.codexReasoningEffort || environment.GENOS_CODEX_REASONING_EFFORT || ''
  ).trim().toLowerCase();
  const options = [];
  if (model) options.push('--model', model);
  if (reasoningEffort) {
    const supported = new Set(['none', 'low', 'medium', 'high', 'xhigh', 'max']);
    if (!supported.has(reasoningEffort)) {
      throw new Error(`Unsupported Codex reasoning effort '${reasoningEffort}'.`);
    }
    options.push('-c', `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`);
  }
  return options;
}

module.exports = { commandOptions };
