'use strict';

const REPAIR_ATTEMPTS = 1;

function usageOf(result) {
  return {
    inputTokens: Number(result.inputTokens || result.input_tokens || 0),
    outputTokens: Number(result.outputTokens || result.output_tokens || 0),
    costUsd: Number(result.costUsd || result.cost_usd || 0)
  };
}

function addUsage(result, previous) {
  const current = usageOf(result);
  return { ...result, inputTokens: current.inputTokens + previous.inputTokens,
    outputTokens: current.outputTokens + previous.outputTokens,
    costUsd: current.costUsd + previous.costUsd,
    schemaRepairAttempts: previous.attempts };
}

function repairPrompt(original, violation, previousText) {
  return `${original}\n\nYour previous response failed the required worker evidence schema. `
    + `Schema diagnostics: ${JSON.stringify(violation)}. Return a complete corrected response only. `
    + `Do not claim work or evidence absent from the previous response.\nPrevious response:\n${String(previousText || '').slice(0, 6000)}`;
}

async function generateWithSchemaRepair(context) {
  const { generate, promptText } = context;
  let result = await generate(promptText);
  const usage = { ...usageOf(result), attempts: 0 };
  while (result.schemaViolation && usage.attempts < REPAIR_ATTEMPTS) {
    usage.attempts += 1;
    result = await generate(repairPrompt(promptText, result.schemaViolation, result.text));
    const diagnostics = result.schemaViolation;
    const accumulated = addUsage(result, usage);
    if (!diagnostics) return accumulated;
  }
  if (usage.attempts) result = addUsage(result, usage);
  return result;
}

module.exports = { generateWithSchemaRepair, repairPrompt, usageOf, REPAIR_ATTEMPTS };
