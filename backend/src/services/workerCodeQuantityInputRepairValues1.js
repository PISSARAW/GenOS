'use strict';

function labelQuantityInputValue1(__genosValueScope1) {
  return __genosValueScope1.repaired.replace(/<input\b[^>]*>/gi, (opening) => {
      const numeric = /\btype\s*=\s*(["'])number\1/i.test(opening);
      const identity = /\b(?:id|name)\s*=\s*(["'])[^"']*(?:quantity|qty)[^"']*\1/i.test(opening);
      return numeric && identity ? (0, __genosValueScope1.setAccessibleName)(opening) : opening;
    });
}

function labelQuantityInputValue2(__genosValueScope2) {
  return /<button\b[^>]*>[\s\S]*?add\s*item[\s\S]*?<\/button\s*>/i.exec(__genosValueScope2.source);
}

module.exports = { labelQuantityInputValue1, labelQuantityInputValue2 };
