'use strict';

function classifyFailure(context) {
if (/AssertionError|assert\.(?:equal|strictEqual|ok|match)|expected values to be strictly equal/i.test(context.text)) {
    return { value: ( 'app_assertion_failure') };
  }
}

function exportedFunctionSnippets(context) {
for (const declaration of (context.exportsObject?.[1] || '').split(',')) {
    const name = declaration.trim().split(/\s*:\s*/)[0];
    if (/^[A-Za-z_$][\w$]*$/.test(name)) context.names.add(name);
  }
}

module.exports = { classifyFailure, exportedFunctionSnippets };
