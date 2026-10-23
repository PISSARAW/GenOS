'use strict';

function labelItemNameInput(content, label) {
  const labelFor = content.match(/<label\b[^>]*\bfor\s*=\s*(["'])([^"']+)\1[^>]*>\s*Item\s*name\b/i)?.[2];
  const inputs = [...content.matchAll(/<input\b[^>]*>/gi)];
  const target = inputs.find((input) => labelFor && input[0].match(/\bid\s*=\s*(["'])([^"']+)\1/i)?.[2] === labelFor)
    || inputs.find((input) => /\b(?:id|name)\s*=\s*(["'])[^"']*item.?name[^"']*\1/i.test(input[0]));
  if (!target) return content;
  const opening = target[0];
  const nextOpening = new RegExp(`\\baria-label\\s*=\\s*(["'])[^"']*\\1`, 'i').test(opening)
    ? opening.replace(/\baria-label\s*=\s*(["'])[^"']*\1/i, `aria-label="${label}"`)
    : opening.replace(/\s*\/?>$/, (closing) => ` aria-label="${label}"${closing}`);
  return content.slice(0, target.index) + nextOpening + content.slice(target.index + opening.length);
}

module.exports = { labelItemNameInput };
