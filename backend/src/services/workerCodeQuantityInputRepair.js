'use strict';

function labelQuantityInput(content) {
  let source = String(content || '');
  const forms = [...source.matchAll(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi)];
  const scopes = forms.length ? forms : [{ 0: source, index: 0 }];
  for (const scope of scopes) {
    const repaired = repairQuantityScope(scope[0]);
    if (!repaired) continue;
    const at = scope.index;
    return source.slice(0, at) + repaired + source.slice(at + scope[0].length);
  }
  const field = '<label for="quantity">Quantity</label><input id="quantity" name="quantity" type="number" min="1" step="1" required aria-label="Quantity">';
  if (forms.length) return source.replace(/<\/form\s*>/i, `${field}</form>`);
  const button = /<button\b[^>]*>[\s\S]*?add\s*item[\s\S]*?<\/button\s*>/i.exec(source);
  if (button) return source.slice(0, button.index) + field + source.slice(button.index);
  return /<\/body\s*>/i.test(source) ? source.replace(/<\/body\s*>/i, `${field}</body>`) : `${source}${field}`;
}

function repairQuantityScope(scope) {
  const fields = [...scope.matchAll(/<input\b[^>]*>/gi)]
    .filter(({ 0: opening }) => isQuantityInput(opening));
  if (!fields.length) return null;
  const preferred = fields.filter(({ 0: opening }) => /\btype\s*=\s*["']number["']/i.test(opening));
  const keep = (preferred.length ? preferred : fields).at(-1);
  const duplicateOffsets = new Set(fields.filter((field) => field.index !== keep.index).map((field) => field.index));
  let seenKept = false;
  return scope.replace(/<input\b[^>]*>/gi, (opening, offset) => {
    if (duplicateOffsets.has(offset)) return '';
    if (!seenKept && offset === keep.index) {
      seenKept = true;
      return setAccessibleName(opening);
    }
    return opening;
  });
}

function isQuantityInput(opening) {
  const quote = String.raw`\\?["']`;
  const type = new RegExp(String.raw`\btype\s*=\s*${quote}number${quote}`, 'i');
  const identity = new RegExp(String.raw`\b(?:id|name)\s*=\s*${quote}(?:quantity|qty)${quote}`, 'i');
  const label = new RegExp(String.raw`\baria-label\s*=\s*${quote}quantity${quote}`, 'i');
  return type.test(opening) && (identity.test(opening) || label.test(opening));
}

function setAccessibleName(opening) {
  if (new RegExp(String.raw`\baria-label\s*=\s*${String.raw`\\?["']`}quantity${String.raw`\\?["']`}`, 'i').test(opening)) {
    return opening.replace(/\\+(["'])/g, '$1');
  }
  if (/\baria-label\s*=/i.test(opening)) {
    return opening.replace(/\baria-label\s*=\s*(["'])[^"']*\1/i, 'aria-label="Quantity"');
  }
  return opening.replace(/\s*\/?>$/, (end) => ` aria-label="Quantity"${end}`);
}

module.exports = { labelQuantityInput };
