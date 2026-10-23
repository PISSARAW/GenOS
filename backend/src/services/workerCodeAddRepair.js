'use strict';

function ensureAddItemBehavior(content) {
  const source = String(content || '');
  if (source.includes('genosAddItemRepair')) return source;
  const objectState = source.match(/\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{[^}]*\bitems\s*:\s*\[\s*\]/i)?.[1];
  const arrayState = source.match(/\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:JSON\.parse\([^;]*?\)\s*\|\|\s*)?\[\s*\]/i)?.[1];
  const containerState = source.match(/\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*document\.(?:querySelector|getElementById)\([^;]*(?:tbody|pantry|items|list)[^;]*\)/i)?.[1];
  const stateName = objectState ? `${objectState}.items` : arrayState || containerState || 'pantry';
  const stateValue = objectState || arrayState || stateName;
  const stateKind = objectState || arrayState ? 'collection' : containerState ? 'container' : 'unknown';
  const field = (pattern, fallback) => source.match(new RegExp(`<input\\b[^>]*\\bid\\s*=\\s*(["'])([^"']*${pattern}[^"']*)\\1`, 'i'))?.[2] || fallback;
  const nameId = field('item.?name|^name$', 'itemName');
  const quantityId = field('quantity|qty', 'quantity');
  const categoryId = source.match(/<select\b[^>]*\bid\s*=\s*(["'])([^"']*category[^"']*)\1/i)?.[2] || 'category';
  const dateId = field('best.?before|date|expiry', 'bestBefore');
  const storageKey = source.match(/localStorage\.getItem\(\s*(["'])([^"']+)\1/i)?.[2] || objectState || stateName;
  const renderer = source.match(/function\s+((?:render|update)[A-Za-z_$][\w$]*)\s*\(/i)?.[1];
  const writeItem = stateKind === 'collection'
    ? `${stateName}.push(item);localStorage.setItem(${JSON.stringify(storageKey)},JSON.stringify(${stateValue}));${renderer ? `${renderer}();` : ''}`
    : stateKind === 'container'
      ? `const row=document.createElement('tr');row.innerHTML='<td>'+name+'</td><td>'+quantity+'</td><td>'+category+'</td><td>'+date+'</td><td><button aria-label="Increase quantity for '+name+'" onclick="increaseQuantity(this)">Increase quantity</button><button aria-label="Delete '+name+'" onclick="deleteItem(this)">Delete</button></td>';${stateName}.appendChild(row);localStorage.setItem(${JSON.stringify(storageKey)},JSON.stringify({itemName:name,quantity,category,bestBeforeDate:date}));`
      : '';
  const script = `<script>document.addEventListener('DOMContentLoaded',function(){let form=document.querySelector('form');if(form){const cleanForm=form.cloneNode(true);cleanForm.removeAttribute('onsubmit');cleanForm.querySelectorAll('button,input[type="submit"],input[type="image"]').forEach(button=>button.removeAttribute('onclick'));form.replaceWith(cleanForm);form=cleanForm;}const addButton=document.querySelector('#addItem,[data-action="add"],button[type="submit"],button[onclick*="addItem"],input[type="submit"]');let target=form&&(!addButton||form.contains(addButton)&&addButton.type==='submit')?form:addButton||form;if(!target)return;if(target!==form){const cleanTarget=target.cloneNode(true);cleanTarget.removeAttribute('onclick');target.replaceWith(cleanTarget);target=cleanTarget;}target.addEventListener(target===form?'submit':'click',function genosAddItemRepair(event){event.preventDefault();event.stopImmediatePropagation();const name=document.getElementById(${JSON.stringify(nameId)})?.value?.trim()||'';const quantity=Number(document.getElementById(${JSON.stringify(quantityId)})?.value);const category=document.getElementById(${JSON.stringify(categoryId)})?.value||'';const date=document.getElementById(${JSON.stringify(dateId)})?.value||'';if(!name||!Number.isFinite(quantity)||quantity<=0){alert('Quantity must be greater than zero.');return;}const item={name,itemName:name,quantity,category,bestBefore:date,bestBeforeDate:date,date};${writeItem}},true);});</script>`;
  return /<\/body\s*>/i.test(source) ? source.replace(/<\/body\s*>/i, `${script}</body>`) : `${source}${script}`;
}

module.exports = { ensureAddItemBehavior };
