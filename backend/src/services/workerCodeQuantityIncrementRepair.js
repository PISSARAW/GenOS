'use strict';

function ensureQuantityIncrementBehavior(content, label = 'Increase quantity for Oats') {
  const source = String(content || '').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,
    (script) => /function\s+genosQuantity(?:Button|Increment|Label)Repair\b/.test(script) ? '' : script)
    .replace(/<button\b(?=[^>]*\baria-label\s*=\s*(["'])(?:increase|increment)\s+quantity\s+for\s+(?:name|item)\1)[^>]*>[\s\S]*?<\/button\s*>/gi, '');
  const match = source.match(/localStorage\.getItem\(\s*(["'])([^"']+)\1/i);
  const key = match ? match[2] : 'pantry';
  const buttonScript = `<script>
function genosQuantityButtonRepair() {
  const prepareRows = () => document.querySelectorAll('tr,[data-item-row],.item,li,[role="listitem"]').forEach(row => {
    const cells = row.querySelectorAll('td');
    const rawName = row.getAttribute('data-item-name') || cells[0]?.textContent?.trim()
      || row.textContent.match(/(?:Name:\\s*)?([^,\\n]+)/i)?.[1]?.trim() || '';
    const name = rawName.replace(/^(?:Name|Item)\\s*:\\s*/i, '').split(/[,;\\n]/)[0]
      .replace(/\\s+(?:Quantity|Qty|Category|Best Before)\\s*:.*$/i, '').trim();
    if (!name || /^(?:name|item|item name|quantity|category)$/i.test(name)) return;
    const buttons = Array.from(row.querySelectorAll('button'));
    buttons.forEach(button => {
      const action = (button.getAttribute('aria-label') || '') + ' '
        + (button.getAttribute('title') || '') + ' ' + button.textContent;
      if (/delete|remove/i.test(action) || !/(increase|increment|decrease|decrement|\\+|▲|↑|−|↓)/i.test(action)) return;
      const direction = /decrease|decrement|−|↓/i.test(action) ? 'Decrease' : 'Increase';
      if (button.hasAttribute('aria-label')) button.removeAttribute('aria-label');
      const actionLabel = direction + ' quantity for ' + name;
      if (button.getAttribute('title') !== actionLabel) button.setAttribute('title', actionLabel);
      const icon = direction === 'Decrease' ? '−' : '+';
      const iconMarkup = '<span aria-hidden="true">' + icon + '</span>';
      if (button.innerHTML !== iconMarkup) button.innerHTML = iconMarkup;
    });
    const existing = buttons.find(button => /increase|increment|\\+|▲|↑/i.test(
      (button.getAttribute('aria-label') || '') + ' ' + (button.getAttribute('title') || '') + ' ' + button.textContent)
      && !/(delete|remove)/i.test((button.getAttribute('aria-label') || '') + ' ' + button.textContent));
    if (existing) return;
    const cell = cells.length ? row.insertCell(-1) : row;
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('title', 'Increase quantity for ' + name);
    button.innerHTML = '<span aria-hidden="true">+</span>';
    cell.appendChild(button);
  });
  document.addEventListener('DOMContentLoaded', prepareRows);
  new MutationObserver(prepareRows).observe(document.documentElement, { childList: true, subtree: true });
}
genosQuantityButtonRepair();
</script>`;
  const script = `<script>document.addEventListener('click',function genosQuantityIncrementRepair(event){const button=event.target.closest?.('button');if(!button)return;const action=(button.getAttribute('aria-label')||'')+' '+(button.getAttribute('title')||'')+' '+button.textContent;if(!/(increase|increment|\\+|▲|↑)/i.test(action)||/(delete|remove)/i.test(action))return;const row=button.closest('tr,[data-item-row],.item,li,[role="listitem"]')||button.parentElement?.parentElement;if(!row)return;const cells=row.querySelectorAll('td');const named=(button.getAttribute('title')||button.getAttribute('aria-label')||'').match(/(?:for|of)\\s+(.+)$/i)?.[1]?.trim();const name=named||row.getAttribute('data-item-name')||cells[0]?.textContent?.trim();const quantityCell=cells[1]||row.querySelector('input[type=\"number\"]')||Array.from(row.querySelectorAll('span,div,p,strong')).find(el=>/^\\d+$/.test(el.textContent.trim()));event.preventDefault();event.stopImmediatePropagation();let stored=[];try{stored=JSON.parse(localStorage.getItem(${JSON.stringify(key)})||'[]');}catch{}let items=Array.isArray(stored)?stored:Array.isArray(stored?.items)?stored.items:null;if(!items){stored=[];items=stored;}let item=items.find(entry=>(entry.name||entry.itemName||entry.ItemName)===name);if(!item){item={name,itemName:name,ItemName:name,category:cells[2]?.textContent?.trim()||'',Category:cells[2]?.textContent?.trim()||'',bestBefore:cells[3]?.textContent?.trim()||'',BestBefore:cells[3]?.textContent?.trim()||'',quantity:0};items.push(item);}const combined=Number(cells[0]?.textContent?.match(/\\d+\\s*$/)?.[0])||0;item.quantity=(Number(quantityCell?.value??quantityCell?.textContent)||Number(item.quantity)||combined)+1;if(quantityCell){if(quantityCell instanceof HTMLInputElement)quantityCell.value=String(item.quantity);else quantityCell.textContent=String(item.quantity);}else if(cells[0])cells[0].textContent=cells[0].textContent.replace(/\\d+\\s*$/,String(item.quantity));if('qty'in item)item.qty=item.quantity;if(Number(item.quantity)>=3)sessionStorage.setItem('genosQuantityReached3','1');localStorage.setItem(${JSON.stringify(key)},JSON.stringify(stored));},true);</script>`;
  const scripts = `${buttonScript}${script}`;
  return /<\/body\s*>/i.test(source) ? source.replace(/<\/body\s*>/i, `${scripts}</body>`) : `${source}${scripts}`;
}

module.exports = { ensureQuantityIncrementBehavior };




