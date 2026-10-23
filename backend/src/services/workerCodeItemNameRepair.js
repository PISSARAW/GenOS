'use strict';

function labelItemNameInput(content, label) {
  const labelFor = content.match(/<label\b[^>]*\bfor\s*=\s*(["'])([^"']+)\1[^>]*>\s*Item\s*name\b/i)?.[2];
  const inputs = [...content.matchAll(/<input\b[^>]*>/gi)];
  const target = inputs.find((input) => labelFor && input[0].match(/\bid\s*=\s*(["'])([^"']+)\1/i)?.[2] === labelFor)
    || inputs.find((input) => /\b(?:id|name)\s*=\s*(["'])[^"']*item.?name[^"']*\1/i.test(input[0]));
  if (!target) {
    const field = `<label for="itemName">${label}</label><input id="itemName" name="itemName" type="text" aria-label="${label}">`;
    if (/<form\b[^>]*>[\s\S]*?<\/form\s*>/i.test(content)) return content.replace(/<\/form\s*>/i, `${field}</form>`);
    const button = /<button\b[^>]*>[\s\S]*?add\s*item[\s\S]*?<\/button\s*>/i.exec(content);
    if (button) return content.slice(0, button.index) + field + content.slice(button.index);
    return /<\/body\s*>/i.test(content) ? content.replace(/<\/body\s*>/i, `${field}</body>`) : `${content}${field}`;
  }
  const opening = target[0];
  const nextOpening = new RegExp(`\\baria-label\\s*=\\s*(["'])[^"']*\\1`, 'i').test(opening)
    ? opening.replace(/\baria-label\s*=\s*(["'])[^"']*\1/i, `aria-label="${label}"`)
    : opening.replace(/\s*\/?>$/, (closing) => ` aria-label="${label}"${closing}`);
  let repaired = content.slice(0, target.index) + nextOpening + content.slice(target.index + opening.length);
  const inputId = nextOpening.match(/\bid\s*=\s*(["'])([^"']+)\1/i)?.[2];
  if (inputId) {
    const labelPattern = new RegExp(`<label\\b(?=[^>]*\\bfor\\s*=\\s*(["'])${inputId}\\1)[^>]*>`, 'gi');
    repaired = repaired.replace(labelPattern, (labelOpening) => labelOpening.replace(/\s+aria-label\s*=\s*(["'])[^"']*\1/i, ''));
  }
  return repaired;
}

module.exports = { labelItemNameInput };
