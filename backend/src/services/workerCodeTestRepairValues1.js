'use strict';

function nextMissionValue1(__genosValueScope1) {
  return {
    ...__genosValueScope1.base,
    ...(__genosValueScope1.current.preserveFailedCodeCandidate ? { preserveFailedCodeCandidate: true } : {}),
    ...(__genosValueScope1.current.forceFullFileReplacement || (__genosValueScope1.error?.code === 'WORKER_OUTPUT_SCHEMA_VIOLATION' && /Exact edit anchor must occur once in /.test((0, __genosValueScope1.String)(__genosValueScope1.error?.workerArtifactDiagnostics?.error || __genosValueScope1.error?.message || '')))
      ? { forceFullFileReplacement: true } : {}),
    prompt: (0, __genosValueScope1.repairPrompt)({ mission: { ...__genosValueScope1.current, prompt: __genosValueScope1.base.prompt }, error: __genosValueScope1.error, attempt: __genosValueScope1.attempt }),
    ...(__genosValueScope1.codeRepairPlans.length ? { codeRepairPlans: __genosValueScope1.codeRepairPlans } : {}),
    timeoutMs: __genosValueScope1.remainingMs,
    executionBudget: { ...__genosValueScope1.base.executionBudget, latencyMs: __genosValueScope1.remainingMs,
      ...(__genosValueScope1.remainingTokens > 0 ? { tokens: __genosValueScope1.remainingTokens } : {}) }
  };
}

function labelIncreaseButtonValue2(__genosValueScope2) {
  return /(?:\$\{\s*(?:itemName|item\.(?:name|label)|item\[['"](?:Item name|name)['"]\])|\b(?:itemName|item\.name)\b)/i.test(__genosValueScope2.button[0])
    && /(?:\bincrease\b|\bincrement\b|\+|▲|↑)/i.test(__genosValueScope2.button[0])
    && !/\b(?:delete|remove)\b/i.test(__genosValueScope2.button[0]);
}

function labelIncreaseButtonValue3(__genosValueScope3) {
  return /(?:\$\{\s*(?:itemName|item\.(?:name|label)|item\[['"](?:Item name|name)['"]\])|\b(?:itemName|item\.name)\b)/i.test(__genosValueScope3.button[0])
    && /(?:\bincrease\b|\bincrement\b|\+|▲|↑)/i.test(__genosValueScope3.button[0])
    && !/\b(?:delete|remove)\b/i.test(__genosValueScope3.button[0]);
}

function labelIncreaseButtonValue4(__genosValueScope4) {
  return __genosValueScope4.currentButtons.find((button) => (0, __genosValueScope4.require)('./workerCodeTestRepairValues1.js').labelIncreaseButtonValue3({ button }))
    || __genosValueScope4.currentButtons.find((button) => /(?:\bincrease\b|\bincrement\b|\+|▲|↑)/i.test(button[0])
    && !/\b(?:delete|remove)\b/i.test(button[0]))
    || __genosValueScope4.currentButtons.find((button) => /\bOats\b/i.test(button[0])
      && !/\b(?:delete|remove)\b/i.test(button[0]));
}

function labelIncreaseButtonValue5(__genosValueScope5) {
  return __genosValueScope5.itemField ? __genosValueScope5.label.replace(/\bOats\b/g, `\${item.${__genosValueScope5.itemField}}`) : /(?:\$\{\s*(?:itemName|item\.(?:name|label)|item\[['"](?:Item name|name)['"]\])|\b(?:itemName|item\.name)\b)/i.test(__genosValueScope5.target[0]) ? __genosValueScope5.label.replace(/\bOats\b/g, '${itemName}') : __genosValueScope5.label;
}

function ensureLocalStorageMutationsValue6(__genosValueScope6) {
  return /\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[\s*\]\s*;?/i.exec(__genosValueScope6.code);
}

function failureFeedbackValue7(__genosValueScope7) {
  return __genosValueScope7.diagnostics ? [
    `Worker output contract rejected (${__genosValueScope7.error.code || 'unknown'}): ${__genosValueScope7.diagnostics.error || __genosValueScope7.error.message}`,
    __genosValueScope7.Array.isArray(__genosValueScope7.diagnostics.violations) ? __genosValueScope7.diagnostics.violations.join('\n') : '',
    __genosValueScope7.diagnostics.outputExcerpt ? `Rejected output excerpt:\n${__genosValueScope7.diagnostics.outputExcerpt}` : ''
  ].filter(__genosValueScope7.Boolean).join('\n') : '';
}

module.exports = { nextMissionValue1, labelIncreaseButtonValue2, labelIncreaseButtonValue3, labelIncreaseButtonValue4, labelIncreaseButtonValue5, ensureLocalStorageMutationsValue6, failureFeedbackValue7 };
