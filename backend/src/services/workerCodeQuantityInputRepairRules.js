'use strict';

function labelQuantityInputRule1(context) {
  return context.repaired.replace(/<input\b[^>]*>/gi, (opening) => {
      const numeric = /\btype\s*=\s*(["'])number\1/i.test(opening);
      const identity = /\b(?:id|name)\s*=\s*(["'])[^"']*(?:quantity|qty)[^"']*\1/i.test(opening);
      return numeric && identity ? context.setAccessibleName(opening) : opening;
    });
}

function labelQuantityInputRule2(context) {
  return /<button\b[^>]*>[\s\S]*?add\s*item[\s\S]*?<\/button\s*>/i.exec(context.source);
}

module.exports = { labelQuantityInputRule1, labelQuantityInputRule2 };
