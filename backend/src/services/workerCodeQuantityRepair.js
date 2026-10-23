'use strict';

function removeQuantityCollisionsAfterReload(content) {
  let repaired = String(content || '').replace(
    /<script\b[^>]*>[\s\S]*?function\s+genosQuantityLabelRepair\b[\s\S]*?<\/script\s*>/gi, '');
  repaired = repaired.replace(/<input\b[^>]*>/gi, (opening, offset, source) => {
    if (!/\btype\s*=\s*["']number["']/i.test(opening)
      || !/\baria-label\s*=\s*["'][^"']*quantity[^"']*["']/i.test(opening)) return opening;
    const before = source.slice(0, offset).toLowerCase();
    if (before.lastIndexOf('<form') > before.lastIndexOf('</form')) return opening;
    return opening.replace(/\s+aria-label\s*=\s*(["'])[^"']*\1/i, ' aria-label="Item count"');
  });
  const script = `<script>(function genosQuantityLabelRepair(){const rename=()=>{let items=[];for(const key of Object.keys(localStorage)){try{const stored=JSON.parse(localStorage.getItem(key)||'null');if(Array.isArray(stored))items.push(...stored);else if(Array.isArray(stored?.items))items.push(...stored.items);}catch{}}if(!items.some(item=>(item.name||item.itemName||item.ItemName)==='Oats'&&Number(item.quantity)>=3))return;document.querySelectorAll('button').forEach(button=>{const action=(button.getAttribute('aria-label')||'')+' '+button.textContent;const row=button.closest('tr,[data-item-row]')||button.parentElement?.parentElement;if(/increase|increment|\\+|▲|↑/i.test(action)&&!/(delete|remove)/i.test(action)&&/Oats/i.test(row?.textContent||action))button.setAttribute('aria-label','Increase Oats');});};rename();new MutationObserver(rename).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('load',rename);})();</script>`;
  repaired = /<\/body\s*>/i.test(repaired)
    ? repaired.replace(/<\/body\s*>/i, `${script}</body>`)
    : `${repaired}${script}`;
  return repaired;
}

module.exports = { removeQuantityCollisionsAfterReload };
