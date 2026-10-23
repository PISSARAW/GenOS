'use strict';

function removeQuantityCollisionsAfterReload(content) {
  let repaired = String(content || '');
  repaired = repaired.replace(/<input\b[^>]*>/gi, (opening, offset, source) => {
    if (!/\btype\s*=\s*["']number["']/i.test(opening)
      || !/\baria-label\s*=\s*["'][^"']*quantity[^"']*["']/i.test(opening)) return opening;
    const before = source.slice(0, offset).toLowerCase();
    if (before.lastIndexOf('<form') > before.lastIndexOf('</form')) return opening;
    return opening.replace(/\s+aria-label\s*=\s*(["'])[^"']*\1/i, ' aria-label="Item count"');
  });
  if (!repaired.includes('genosQuantityLabelRepair')) {
    const script = `<script>window.addEventListener('load',function genosQuantityLabelRepair(){document.querySelectorAll('button[aria-label*="Increase quantity"]').forEach(button=>{const row=button.closest('tr');const itemName=row?.querySelector('td')?.textContent?.trim()||'item';button.setAttribute('aria-label','Increase '+itemName);});});</script>`;
    repaired = /<\/body\s*>/i.test(repaired)
      ? repaired.replace(/<\/body\s*>/i, `${script}</body>`)
      : `${repaired}${script}`;
  }
  return repaired;
}

module.exports = { removeQuantityCollisionsAfterReload };
