'use strict';

function classifyFailureStage1(__genosStageScope1) {
if (/AssertionError|assert\.(?:equal|strictEqual|ok|match)|expected values to be strictly equal/i.test(__genosStageScope1.text)) {
    return { value: ( 'app_assertion_failure') };
  }
}

function exportedFunctionSnippetsStage2(__genosStageScope2) {
for (const declaration of (__genosStageScope2.exportsObject?.[1] || '').split(',')) {
    const name = declaration.trim().split(/\s*:\s*/)[0];
    if (/^[A-Za-z_$][\w$]*$/.test(name)) __genosStageScope2.names.add(name);
  }
}

module.exports = { classifyFailureStage1, exportedFunctionSnippetsStage2 };
