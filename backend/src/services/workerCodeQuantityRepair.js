'use strict';

function removeQuantityCollisionsAfterReload(content) {
  let repaired = String(content || '').replace(/<button\b[^>]*>/gi, (opening) =>
    /\baria-label\s*=\s*["'][^"']*increase quantity/i.test(opening)
      ? opening.replace(/\s+aria-label\s*=\s*["'][^"']*increase quantity[^"']*["']/i, ' aria-label="Increase Oats"')
      : opening);
  repaired = repaired.replace(/<input\b[^>]*>/gi, (opening, offset, source) => {
    if (!/\btype\s*=\s*["']number["']/i.test(opening)
      || !/\baria-label\s*=\s*["'][^"']*quantity[^"']*["']/i.test(opening)) return opening;
    const before = source.slice(0, offset).toLowerCase();
    if (before.lastIndexOf('<form') > before.lastIndexOf('</form')) return opening;
    return opening.replace(/\s+aria-label\s*=\s*["'][^"']*["']/i, ' aria-label="Item count"');
  });
  return repaired;
}

module.exports = { removeQuantityCollisionsAfterReload };
