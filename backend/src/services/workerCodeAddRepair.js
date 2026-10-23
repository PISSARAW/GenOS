'use strict';

function ensureAddItemBehavior(content) {
  const source = String(content || '');
  if (source.includes('genosAddItemRepair')) return source;
  const stateName = source.match(/\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[\s*\]/i)?.[1] || 'pantry';
  const field = (pattern, fallback) => source.match(new RegExp(`<input\\b[^>]*\\bid\\s*=\\s*(["'])([^"']*${pattern}[^"']*)\\1`, 'i'))?.[2] || fallback;
  const nameId = field('item.?name|^name$', 'itemName');
  const quantityId = field('quantity|qty', 'quantity');
  const categoryId = source.match(/<select\b[^>]*\bid\s*=\s*(["'])([^"']*category[^"']*)\1/i)?.[2] || 'category';
  const dateId = field('best.?before|date|expiry', 'bestBefore');
  const storageKey = source.match(/localStorage\.getItem\(\s*(["'])([^"']+)\1/i)?.[2] || stateName;
  const renderer = source.match(/function\s+((?:render|update)[A-Za-z_$][\w$]*)\s*\(/i)?.[1];
  const script = `<script>document.addEventListener('DOMContentLoaded',function(){const form=document.querySelector('form');if(!form)return;form.addEventListener('submit',function genosAddItemRepair(event){event.preventDefault();event.stopImmediatePropagation();const name=document.getElementById(${JSON.stringify(nameId)})?.value?.trim()||'';const quantity=Number(document.getElementById(${JSON.stringify(quantityId)})?.value);const category=document.getElementById(${JSON.stringify(categoryId)})?.value||'';const date=document.getElementById(${JSON.stringify(dateId)})?.value||'';if(!name||!Number.isFinite(quantity)||quantity<=0){alert('Quantity must be greater than zero.');return;}const item={name,itemName:name,quantity,category,bestBefore:date,date};${stateName}.push(item);localStorage.setItem(${JSON.stringify(storageKey)},JSON.stringify(${stateName}));${renderer ? `${renderer}();` : ''}},true);});</script>`;
  return /<\/body\s*>/i.test(source) ? source.replace(/<\/body\s*>/i, `${script}</body>`) : `${source}${script}`;
}

module.exports = { ensureAddItemBehavior };
