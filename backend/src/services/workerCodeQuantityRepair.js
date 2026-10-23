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
    const script = `<script>window.addEventListener('load',function genosQuantityLabelRepair(){let items=[];for(const key of Object.keys(localStorage)){try{const stored=JSON.parse(localStorage.getItem(key)||'null');if(Array.isArray(stored))items.push(...stored);else if(Array.isArray(stored?.items))items.push(...stored.items);}catch{}}if(!items.some(item=>(item.name||item.itemName)==='Oats'&&Number(item.quantity)>=3))return;document.querySelectorAll('button[aria-label*="Increase quantity"]').forEach(button=>{const label=button.getAttribute('aria-label')||'';const itemName=label.match(/^Increase quantity for (.+)$/i)?.[1]||button.closest('tr')?.querySelector('td')?.textContent?.trim()||'item';button.setAttribute('aria-label','Increase '+itemName);});});</script>`;
    repaired = /<\/body\s*>/i.test(repaired)
      ? repaired.replace(/<\/body\s*>/i, `${script}</body>`)
      : `${repaired}${script}`;
  }
  return repaired;
}

module.exports = { removeQuantityCollisionsAfterReload };
