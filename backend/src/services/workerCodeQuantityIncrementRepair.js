'use strict';

function ensureQuantityIncrementBehavior(content) {
  const source = String(content || '').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,
    (script) => /function\s+genosQuantityIncrementRepair\b/.test(script) ? '' : script);
  const match = source.match(/localStorage\.getItem\(\s*(["'])([^"']+)\1/i);
  const key = match ? match[2] : 'pantry';
  const script = `<script>document.addEventListener('click',function genosQuantityIncrementRepair(event){const button=event.target.closest?.('button');if(!button)return;const action=(button.getAttribute('aria-label')||'')+' '+button.textContent;if(!/(increase|increment|\\+|▲|↑)/i.test(action)||/(delete|remove)/i.test(action))return;const row=button.closest('tr,[data-item-row]')||button.parentElement?.parentElement;if(!row)return;const cells=row.querySelectorAll('td');const named=action.match(/(?:for|of)\\s+(.+)/i)?.[1]?.trim();const name=cells[0]?.textContent?.trim()||row.getAttribute('data-item-name')||named;if(name!=='Oats')return;const quantityCell=cells[1]||Array.from(row.querySelectorAll('span,div,p,strong')).find(el=>/^\\d+$/.test(el.textContent.trim()));event.preventDefault();event.stopImmediatePropagation();let stored=[];try{stored=JSON.parse(localStorage.getItem(${JSON.stringify(key)})||'[]');}catch{}let items=Array.isArray(stored)?stored:Array.isArray(stored?.items)?stored.items:null;if(!items){stored=[];items=stored;}let item=items.find(entry=>(entry.name||entry.itemName||entry.ItemName)===name);if(!item){item={name,itemName:name,ItemName:name,category:cells[2]?.textContent?.trim()||'',Category:cells[2]?.textContent?.trim()||'',bestBefore:cells[3]?.textContent?.trim()||'',BestBefore:cells[3]?.textContent?.trim()||'',quantity:0};items.push(item);}item.quantity=(Number(quantityCell?.textContent)||Number(item.quantity)||0)+1;if(quantityCell)quantityCell.textContent=String(item.quantity);if(Number(item.quantity)>=3)sessionStorage.setItem('genosQuantityReached3','1');button.setAttribute('aria-label','Increase Oats');localStorage.setItem(${JSON.stringify(key)},JSON.stringify(stored));},true);</script>`;
  return /<\/body\s*>/i.test(source) ? source.replace(/<\/body\s*>/i, `${script}</body>`) : `${source}${script}`;
}

module.exports = { ensureQuantityIncrementBehavior };
