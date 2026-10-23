'use strict';

function scriptCodeBefore(source, index) {
  const scriptStart = source.lastIndexOf('<script', index);
  if (scriptStart < 0) return null;
  const codeStart = source.indexOf('>', scriptStart) + 1;
  if (codeStart <= 0 || source.indexOf('</script', index) < 0) return null;
  return source.slice(codeStart, index);
}

function advanceScriptState(state, char) {
  if (state.quote) {
    if (state.escaped) state.escaped = false;
    else if (char === '\\') state.escaped = true;
    else if (char === state.quote) state.quote = '';
    return;
  }
  if (char === '"' || char === "'" || char === '`') state.quote = char;
  else if (char === '{') state.depth += 1;
  else if (char === '}') state.depth -= 1;
}

function isTopLevelScriptPosition(source, index) {
  const code = scriptCodeBefore(source, index);
  if (code === null) return false;
  const state = { depth: 0, quote: '', escaped: false };
  for (const char of code) advanceScriptState(state, char);
  return state.depth === 0;
}

function topLevelMatch(source, expression) {
  for (const match of source.matchAll(expression)) {
    if (isTopLevelScriptPosition(source, match.index)) return match;
  }
  return null;
}

function matchValue(source, expression, fallback) {
  const match = source.match(expression);
  return match ? match[1] : fallback;
}

function discoverContainer(source) {
  const query = source.match(/document\.(querySelector|getElementById)\(\s*(['"])([^'"]*(?:tbody|pantry|items|list)[^'"]*)\2\s*\)/i);
  if (query) return `document.${query[1]}(${JSON.stringify(query[3])})`;
  const table = source.match(/<table\b[^>]*\bid\s*=\s*(["'])([^"']+)\1[^>]*>[\s\S]*?<tbody\b/i);
  return table ? `document.querySelector(${JSON.stringify(`#${table[2]} tbody`)})` : null;
}

function discoverState(source) {
  const objectState = topLevelMatch(source, /\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{[^}]*\bitems\s*:\s*\[\s*\]/gi);
  const arrayState = topLevelMatch(source, /\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:JSON\.parse\([^;]*?\)\s*\|\|\s*)?\[\s*\]/gi);
  const containerState = topLevelMatch(source, /\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*document\.(?:querySelector|getElementById)\([^;]*(?:tbody|pantry|items|list)[^;]*\)/gi);
  const containerExpression = discoverContainer(source);
  const objectName = objectState ? objectState[1] : '';
  const arrayName = arrayState ? arrayState[1] : '';
  const containerName = containerState ? containerState[1] : '';
  const stateName = objectName ? `${objectName}.items` : arrayName || containerExpression || 'pantry';
  const stateValue = objectName || arrayName || stateName;
  const stateKind = objectName || arrayName ? 'collection' : containerName || containerExpression ? 'container' : 'unknown';
  return { stateName, stateValue, stateKind, containerExpression };
}

function inputId(source, pattern, fallback) {
  const expression = new RegExp(`<input\\b[^>]*\\bid\\s*=\\s*(["'])([^"']*${pattern}[^"']*)\\1`, 'i');
  const match = source.match(expression);
  return match ? match[2] : fallback;
}

function discoverFields(source) {
  const category = source.match(/<select\b[^>]*\bid\s*=\s*(["'])([^"']*category[^"']*)\1/i);
  return {
    nameId: inputId(source, 'item.?name|^name$', 'itemName'),
    quantityId: inputId(source, 'quantity|qty', 'quantity'),
    categoryId: category ? category[2] : 'category',
    dateId: inputId(source, 'best.?before|date|expiry', 'bestBefore')
  };
}

function storageKey(source, state) {
  const key = source.match(/localStorage\.getItem\(\s*(["'])([^"']+)\1/i);
  if (key) return key[2];
  return state.stateKind === 'collection' ? state.stateValue : 'pantry';
}

function rendererName(source) {
  return matchValue(source, /function\s+((?:render|update)[A-Za-z_$][\w$]*)\s*\(/i, '');
}

function collectionWrite(state, key, renderer) {
  const render = renderer ? `${renderer}();` : '';
  return `${state.stateName}.push(item);localStorage.setItem(${JSON.stringify(key)},JSON.stringify(${state.stateValue}));${render}`;
}

function containerWrite(state, key) {
  const container = state.containerExpression || state.stateName;
  return `const stored=JSON.parse(localStorage.getItem(${JSON.stringify(key)} )||'[]');const items=Array.isArray(stored)?stored:[];items.push(item);localStorage.setItem(${JSON.stringify(key)},JSON.stringify(items));const row=document.createElement('tr');row.innerHTML='<td>'+name+'</td><td>'+quantity+'</td><td>'+category+'</td><td>'+date+'</td><td><button data-action="increase" aria-label="Increase quantity for '+name+'">Increase quantity</button><button data-action="delete" aria-label="Delete '+name+'">Delete</button></td>';const container=${container};container.appendChild(row);const save=()=>localStorage.setItem(${JSON.stringify(key)},JSON.stringify(items));row.querySelector('[data-action="increase"]').addEventListener('click',()=>{item.quantity=Number(item.quantity)+1;row.cells[1].textContent=String(item.quantity);save();});row.querySelector('[data-action="delete"]').addEventListener('click',()=>{items.splice(items.indexOf(item),1);row.remove();save();});`;
}

function writeBehavior(state, key, renderer) {
  if (state.stateKind === 'collection') return collectionWrite(state, key, renderer);
  if (state.stateKind === 'container') return containerWrite(state, key);
  return '';
}

function addHandlerScript(source, state, fields, key, renderer) {
  const writeItem = writeBehavior(state, key, renderer);
  return `<script>document.addEventListener('DOMContentLoaded',function(){let form=document.querySelector('form');if(form){const cleanForm=form.cloneNode(true);cleanForm.removeAttribute('onsubmit');cleanForm.querySelectorAll('button,input[type="submit"],input[type="image"]').forEach(button=>button.removeAttribute('onclick'));form.replaceWith(cleanForm);form=cleanForm;}const addButton=document.querySelector('#addItem,[data-action="add"],button[type="submit"],button[onclick*="addItem"],input[type="submit"]');let target=form&&(!addButton||form.contains(addButton)&&addButton.type==='submit')?form:addButton||form;if(!target)return;if(target!==form){const cleanTarget=target.cloneNode(true);cleanTarget.removeAttribute('onclick');target.replaceWith(cleanTarget);target=cleanTarget;}target.addEventListener(target===form?'submit':'click',function genosAddItemRepair(event){event.preventDefault();event.stopImmediatePropagation();const name=document.getElementById(${JSON.stringify(fields.nameId)})?.value?.trim()||'';const quantity=Number(document.getElementById(${JSON.stringify(fields.quantityId)})?.value);const category=document.getElementById(${JSON.stringify(fields.categoryId)})?.value||'';const date=document.getElementById(${JSON.stringify(fields.dateId)})?.value||'';if(!name||!Number.isFinite(quantity)||quantity<=0){alert('Quantity must be greater than zero.');return;}const item={name,itemName:name,quantity,category,bestBefore:date,bestBeforeDate:date,date};${writeItem}},true);});</script>`;
}

function ensureAddItemBehavior(content) {
  const source = String(content || '');
  if (source.includes('genosAddItemRepair')) return source;
  const state = discoverState(source);
  const fields = discoverFields(source);
  const key = storageKey(source, state);
  const renderer = rendererName(source);
  const script = addHandlerScript(source, state, fields, key, renderer);
  return /<\/body\s*>/i.test(source) ? source.replace(/<\/body\s*>/i, `${script}</body>`) : `${source}${script}`;
}

module.exports = { ensureAddItemBehavior };
