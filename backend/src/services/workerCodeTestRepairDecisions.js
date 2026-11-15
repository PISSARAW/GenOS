'use strict';

function nextMission(context) {
  return {
    ...context.base,
    ...(context.current.preserveFailedCodeCandidate ? { preserveFailedCodeCandidate: true } : {}),
    ...(context.current.forceFullFileReplacement || (context.error?.code === 'WORKER_OUTPUT_SCHEMA_VIOLATION' && /Exact edit anchor must occur once in /.test(context.String(context.error?.workerArtifactDiagnostics?.error || context.error?.message || '')))
      ? { forceFullFileReplacement: true } : {}),
    prompt: context.repairPrompt({ mission: { ...context.current, prompt: context.base.prompt }, error: context.error, attempt: context.attempt }),
    ...(context.codeRepairPlans.length ? { codeRepairPlans: context.codeRepairPlans } : {}),
    timeoutMs: context.remainingMs,
    executionBudget: { ...context.base.executionBudget, latencyMs: context.remainingMs,
      ...(context.remainingTokens > 0 ? { tokens: context.remainingTokens } : {}) }
  };
}

function labelIncreaseButtonRule2(context) {
  return /(?:\$\{\s*(?:itemName|item\.(?:name|label)|item\[['"](?:Item name|name)['"]\])|\b(?:itemName|item\.name)\b)/i.test(context.button[0])
    && /(?:\bincrease\b|\bincrement\b|\+|▲|↑)/i.test(context.button[0])
    && !/\b(?:delete|remove)\b/i.test(context.button[0]);
}

function labelIncreaseButtonRule3(context) {
  return /(?:\$\{\s*(?:itemName|item\.(?:name|label)|item\[['"](?:Item name|name)['"]\])|\b(?:itemName|item\.name)\b)/i.test(context.button[0])
    && /(?:\bincrease\b|\bincrement\b|\+|▲|↑)/i.test(context.button[0])
    && !/\b(?:delete|remove)\b/i.test(context.button[0]);
}

function labelIncreaseButtonRule4(context) {
  return context.currentButtons.find((button) => context.require('./workerCodeTestRepairDecisions.js').labelIncreaseButtonRule3({ button }))
    || context.currentButtons.find((button) => /(?:\bincrease\b|\bincrement\b|\+|▲|↑)/i.test(button[0])
    && !/\b(?:delete|remove)\b/i.test(button[0]))
    || context.currentButtons.find((button) => /\bOats\b/i.test(button[0])
      && !/\b(?:delete|remove)\b/i.test(button[0]));
}

function labelIncreaseButtonRule5(context) {
  return context.itemField ? context.label.replace(/\bOats\b/g, `\${item.${context.itemField}}`) : /(?:\$\{\s*(?:itemName|item\.(?:name|label)|item\[['"](?:Item name|name)['"]\])|\b(?:itemName|item\.name)\b)/i.test(context.target[0]) ? context.label.replace(/\bOats\b/g, '${itemName}') : context.label;
}

function ensureLocalStorageMutations(context) {
  return /\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[\s*\]\s*;?/i.exec(context.code);
}

function failureFeedback(context) {
  return context.diagnostics ? [
    `Worker output contract rejected (${context.error.code || 'unknown'}): ${context.diagnostics.error || context.error.message}`,
    context.Array.isArray(context.diagnostics.violations) ? context.diagnostics.violations.join('\n') : '',
    context.diagnostics.outputExcerpt ? `Rejected output excerpt:\n${context.diagnostics.outputExcerpt}` : ''
  ].filter(context.Boolean).join('\n') : '';
}

module.exports = { nextMission, labelIncreaseButtonRule2, labelIncreaseButtonRule3, labelIncreaseButtonRule4, labelIncreaseButtonRule5, ensureLocalStorageMutations, failureFeedback };
