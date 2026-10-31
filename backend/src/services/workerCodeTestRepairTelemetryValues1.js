'use strict';

function classifyFailureValue1(__genosValueScope1) {
  return /strict mode violation|locator\.(?:click|fill|selectOption|waitFor)|waiting for getBy(?:Label|Role|Text)|getBy(?:Label|Role|Text)\(/i.test(__genosValueScope1.text);
}

function classifyFailureValue2(__genosValueScope2) {
  return /MODEL_ROUTE_DEADLINE_EXCEEDED|(?:model|provider|route).{0,40}(?:timeout|deadline)|(?:timeout|deadline).{0,40}(?:model|provider|route)/i.test(__genosValueScope2.text);
}

function exportedFunctionSnippetsValue3(__genosValueScope3) {
  return (0, __genosValueScope3.String)(__genosValueScope3.source).matchAll(/\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g);
}

module.exports = { classifyFailureValue1, classifyFailureValue2, exportedFunctionSnippetsValue3 };
