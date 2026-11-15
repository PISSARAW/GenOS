'use strict';

function classifyFailureRule1(context) {
  return /strict mode violation|locator\.(?:click|fill|selectOption|waitFor)|waiting for getBy(?:Label|Role|Text)|getBy(?:Label|Role|Text)\(/i.test(context.text);
}

function classifyFailureRule2(context) {
  return /MODEL_ROUTE_DEADLINE_EXCEEDED|(?:model|provider|route).{0,40}(?:timeout|deadline)|(?:timeout|deadline).{0,40}(?:model|provider|route)/i.test(context.text);
}

function exportedFunctionSnippets(context) {
  return context.String(context.source).matchAll(/\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g);
}

module.exports = { classifyFailureRule1, classifyFailureRule2, exportedFunctionSnippets };
