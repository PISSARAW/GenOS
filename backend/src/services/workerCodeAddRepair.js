'use strict';

function ensureAddItemBehavior(content) {
  const source = String(content || '');
  if (source.includes('genosAddItemRepair')) return source;
  const objectState = source.match(/\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{[^}]*\bitems\s*:\s*\[\s*\]/i)?.[1];
  const arrayState = source.match(/\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[\s*\]/i)?.[1];
  const stateName = objectState ? `${objectState}.items` : arrayState || 'pantry';
  const stateValue = objectState || stateName;
  const field = (pattern, fallback) => source.match(new RegExp(`<input\\b[^>]*\\bid\\s*=\\s*(["'])([^"']*${pattern}[^"']*)\\1`, 'i'))?.[2] || fallback;
  const nameId = field('item.?name|^name$', 'itemName');
  const quantityId = field('quantity|qty', 'quantity');
  const categoryId = source.match(/<select\b[^>]*\bid\s*=\s*(["'])([^"']*category[^"']*)\1/i)?.[2] || 'category';
  const dateId = field('best.?before|date|expiry', 'bestBefore');
  const storageKey = source.match(/localStorage\.getItem\(\s*(["'])([^"']+)\1/i)?.[2] || objectState || stateName;
  const renderer = source.match(/function\s+((?:render|update)[A-Za-z_$][\w$]*)\s*\(/i)?.[1];
  const script = `<script>document.addEventListener('DOMContentLoaded',function(){const form=document.querySelector('form');const target=form||document.querySelector('button[type="submit"],#addItem,[data-action="add"]');if(!target)return;target.addEventListener(form?'submit':'click',function genosAddItemRepair(event){event.preventDefault();event.stopImmediatePropagation();const name=document.getElementById(${JSON.stringify(nameId)})?.value?.trim()||'';const quantity=Number(document.getElementById(${JSON.stringify(quantityId)})?.value);const category=document.getElementById(${JSON.stringify(categoryId)})?.value||'';const date=document.getElementById(${JSON.stringify(dateId)})?.value||'';if(!name||!Number.isFinite(quantity)||quantity<=0){alert('Quantity must be greater than zero.');return;}const item={name,itemName:name,quantity,category,bestBefore:date,bestBeforeDate:date,date};${stateName}.push(item);localStorage.setItem(${JSON.stringify(storageKey)},JSON.stringify(${stateValue}));${renderer ? `${renderer}();` : ''}},true);});</script>`;
  return /<\/body\s*>/i.test(source) ? source.replace(/<\/body\s*>/i, `${script}</body>`) : `${source}${script}`;
}

module.exports = { ensureAddItemBehavior };
