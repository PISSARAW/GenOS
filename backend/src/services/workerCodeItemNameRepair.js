'use strict';

function labelItemNameInput(content, label) {
  const labelFor = content.match(/<label\b[^>]*\bfor\s*=\s*(["'])([^"']+)\1[^>]*>\s*Item\s*name\b/i)?.[2];
  const inputs = [...content.matchAll(/<input\b[^>]*>/gi)];
  const isEditable = (input) => !/\b(?:readonly|disabled)\b/i.test(input[0])
    && !/\btype\s*=\s*(["'])hidden\1/i.test(input[0]);
  const labeled = inputs.filter((input) => labelFor
    && input[0].match(/\bid\s*=\s*(["'])([^"']+)\1/i)?.[2] === labelFor);
  const target = labeled.find(isEditable)
    || inputs.find((input) => isEditable(input)
      && /\b(?:id|name)\s*=\s*(["'])[^"']*item.?name[^"']*\1/i.test(input[0]));
  if (!target) {
    const field = `<label for="itemName">${label}</label><input id="itemName" name="itemName" type="text" aria-label="${label}">`;
    if (/<form\b[^>]*>[\s\S]*?<\/form\s*>/i.test(content)) return content.replace(/<\/form\s*>/i, `${field}</form>`);
    const button = /<button\b[^>]*>[\s\S]*?add\s*item[\s\S]*?<\/button\s*>/i.exec(content);
    if (button) return content.slice(0, button.index) + field + content.slice(button.index);
    return /<\/body\s*>/i.test(content) ? content.replace(/<\/body\s*>/i, `${field}</body>`) : `${content}${field}`;
  }
  const targetIndex = inputs.indexOf(target);
  const inputId = target[0].match(/\bid\s*=\s*(["'])([^"']+)\1/i)?.[2] || labelFor;
  let index = 0;
  let repaired = content.replace(/<input\b[^>]*>/gi, (opening) => {
    const currentIndex = index++;
    if (currentIndex === targetIndex) {
      return /\baria-label\s*=\s*(["'])[^"']*\1/i.test(opening)
        ? opening.replace(/\baria-label\s*=\s*(["'])[^"']*\1/i, `aria-label="${label}"`)
        : opening.replace(/\s*\/?>$/, (closing) => ` aria-label="${label}"${closing}`);
    }
    let other = opening;
    const otherId = other.match(/\bid\s*=\s*(["'])([^"']+)\1/i)?.[2];
    if (inputId && otherId === inputId) other = other.replace(/\s+id\s*=\s*(["'])[^"']*\1/i, '');
    return other.replace(/\s+aria-label\s*=\s*(["'])item\s*name\1/i, '');
  });
  repaired = repaired.replace(/(<label\b[^>]*\bfor\s*=\s*(["'])[^"']+\2[^>]*>)\s*(<input\b)/i,
    (match, labelOpening) => labelOpening.replace(/\s+aria-label\s*=\s*(["'])[^"']*\1/i, '') + match.slice(labelOpening.length));
  return repaired;
}

module.exports = { labelItemNameInput };
