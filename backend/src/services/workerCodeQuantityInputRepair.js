'use strict';

function labelQuantityInput(content) {
  const source = String(content || '');
  const forms = [...source.matchAll(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi)];
  const scopes = forms.length ? forms : [{ 0: source, index: 0 }];
  for (const scope of scopes) {
    const opening = findQuantityInput(scope[0]);
    if (!opening) continue;
    const replacement = setAccessibleName(opening);
    const at = scope.index + scope[0].indexOf(opening);
    return source.slice(0, at) + replacement + source.slice(at + opening.length);
  }
  return source;
}

function findQuantityInput(scope) {
  const inputs = [...scope.matchAll(/<input\b[^>]*>/gi)]
    .filter((match) => /\btype\s*=\s*["']number["']/i.test(match[0]));
  const preferred = inputs.find(({ 0: opening }) => /\b(?:id|name)\s*=\s*["'](?:quantity|qty)["']/i.test(opening));
  return (preferred || inputs[0])?.[0] || null;
}

function setAccessibleName(opening) {
  if (/\baria-label\s*=\s*["']quantity["']/i.test(opening)) return opening;
  if (/\baria-label\s*=/i.test(opening)) {
    return opening.replace(/\baria-label\s*=\s*(["'])[^"']*\1/i, 'aria-label="Quantity"');
  }
  return opening.replace(/\s*\/?>$/, (end) => ` aria-label="Quantity"${end}`);
}

module.exports = { labelQuantityInput };
