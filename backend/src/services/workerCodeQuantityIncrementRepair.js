'use strict';

function ensureQuantityIncrementBehavior(content) {
  const source = String(content || '');
  if (source.includes('genosQuantityIncrementRepair')) return source;
  const match = source.match(/localStorage\.getItem\(\s*(["'])([^"']+)\1/i);
  const key = match ? match[2] : 'pantry';
  const script = `<script>document.addEventListener('click',function genosQuantityIncrementRepair(event){const button=event.target.closest('button[aria-label*="Increase quantity for Oats"]');if(!button)return;const row=button.closest('tr');if(!row||!row.innerText.includes('Oats'))return;event.preventDefault();event.stopImmediatePropagation();const cells=row.querySelectorAll('td');const name=cells[0]?.textContent?.trim();const quantityCell=cells[1];if(!name||!quantityCell)return;let stored=[];try{stored=JSON.parse(localStorage.getItem(${JSON.stringify(key)})||'[]');}catch{}let items=Array.isArray(stored)?stored:Array.isArray(stored?.items)?stored.items:null;if(!items){stored=[];items=stored;}let item=items.find(entry=>(entry.name||entry.itemName)===name);if(!item){item={name,itemName:name,category:cells[2]?.textContent?.trim()||'',bestBefore:cells[3]?.textContent?.trim()||'',quantity:Number(quantityCell.textContent)||0};items.push(item);}item.quantity=Number(item.quantity)+1;quantityCell.textContent=String(item.quantity);localStorage.setItem(${JSON.stringify(key)},JSON.stringify(stored));},true);</script>`;
  return /<\/body\s*>/i.test(source) ? source.replace(/<\/body\s*>/i, `${script}</body>`) : `${source}${script}`;
}

module.exports = { ensureQuantityIncrementBehavior };
