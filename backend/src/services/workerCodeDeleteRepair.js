'use strict';

function ensureDeleteBehavior(content) {
  const source = String(content || '');
  if (source.includes('genosDeleteRepair')) return source;
  const key = source.match(/localStorage\.getItem\(\s*(["'])([^"']+)\1/i)?.[2] || 'pantry';
  const script = `<script>document.addEventListener('click',function genosDeleteRepair(event){const button=event.target.closest?.('button');if(!button||!/(delete|remove)/i.test((button.getAttribute('aria-label')||'')+' '+button.textContent))return;const row=button.closest('tr,[data-item-row],.item,li,[role="listitem"]')||button.parentElement?.parentElement;if(!row)return;const cells=row.querySelectorAll('td');const label=button.getAttribute('aria-label')||button.textContent;const name=row.getAttribute('data-item-name')||cells[0]?.textContent?.trim()||label.match(/(?:delete|remove)\s+(.+)/i)?.[1]?.trim();event.preventDefault();event.stopImmediatePropagation();let stored=[];try{stored=JSON.parse(localStorage.getItem(${JSON.stringify(key)})||'[]');}catch{}const items=Array.isArray(stored)?stored:Array.isArray(stored?.items)?stored.items:Array.isArray(stored?.inventory)?stored.inventory:null;if(items&&name){const next=items.filter(item=>(item.name||item.itemName||item.ItemName)!==name);if(Array.isArray(stored))localStorage.setItem(${JSON.stringify(key)},JSON.stringify(next));else if(Array.isArray(stored?.items))localStorage.setItem(${JSON.stringify(key)},JSON.stringify({...stored,items:next}));else localStorage.setItem(${JSON.stringify(key)},JSON.stringify({...stored,inventory:next}));}row.remove();},true);</script>`;
  return /<\/body\s*>/i.test(source) ? source.replace(/<\/body\s*>/i, `${script}</body>`) : `${source}${script}`;
}

module.exports = { ensureDeleteBehavior };
