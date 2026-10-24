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
  const expression = /<input\b[^>]*\bid\s*=\s*(["'])([^"']*)\1/gi;
  const expectedId = new RegExp(pattern, 'i');
  for (const match of source.matchAll(expression)) {
    if (/\btype\s*=\s*(["'])(?:search|hidden)\1|\b(?:readonly|disabled)\b/i.test(match[0])) continue;
    if (expectedId.test(match[2])) return match[2];
  }
  return fallback;
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

function rendererName(source, stateName) {
  const match = source.match(/function\s+((?:render|update)[A-Za-z_$][\w$]*)\s*\(\s*([^)]*)\)/i);
  if (!match) return '';
  const argument = !match[2].trim() ? ''
    : /(?:render|update)(?:Pantry)?(?:Item|Row|Entry)$/i.test(match[1]) ? 'item' : stateName;
  return `${match[1]}(${argument})`;
}

function collectionWrite(state, key, renderer) {
  const render = renderer ? `try{${renderer};}catch{}` : '';
  return `${state.stateName}.push(item);localStorage.setItem(${JSON.stringify(key)},JSON.stringify(${state.stateValue}));${render}`;
}

function storageCollectionWrite(key, renderer) {
  const render = renderer ? `try{${renderer};}catch{}` : '';
  return `const stored=JSON.parse(localStorage.getItem(${JSON.stringify(key)})||'[]');const items=Array.isArray(stored)?stored:Array.isArray(stored?.items)?stored.items:[];items.push(item);localStorage.setItem(${JSON.stringify(key)},JSON.stringify(items));${render}`;
}

function containerWrite(state, key) {
  const container = state.containerExpression || state.stateName;
  return `const stored=JSON.parse(localStorage.getItem(${JSON.stringify(key)} )||'[]');const items=Array.isArray(stored)?stored:[];items.push(item);localStorage.setItem(${JSON.stringify(key)},JSON.stringify(items));const row=document.createElement('tr');row.innerHTML='<td>'+name+'</td><td>'+quantity+'</td><td>'+category+'</td><td>'+date+'</td><td><button data-action="increase" aria-label="Increase quantity for '+name+'">Increase quantity</button><button data-action="delete" aria-label="Delete '+name+'">Delete</button></td>';const container=${container};container.appendChild(row);const save=()=>localStorage.setItem(${JSON.stringify(key)},JSON.stringify(items));row.querySelector('[data-action="increase"]').addEventListener('click',()=>{item.quantity=Number(item.quantity)+1;row.cells[1].textContent=String(item.quantity);save();});row.querySelector('[data-action="delete"]').addEventListener('click',()=>{items.splice(items.indexOf(item),1);row.remove();save();});`;
}

function writeBehavior(state, key, renderer) {
  if (state.stateKind === 'collection') return collectionWrite(state, key, renderer);
  if (state.stateKind === 'container') return containerWrite(state, key);
  return storageCollectionWrite(key, renderer);
}

function ensureVisibleItem(key) {
  return `function genosEnsureVisibleItem(name,quantity,category,date){if(!name)return;const leaf=Array.from(document.querySelectorAll('body *')).find(el=>!['INPUT','BUTTON','LABEL','SCRIPT','STYLE'].includes(el.tagName)&&el.children.length===0&&(el.textContent?.trim()===name||el.textContent?.trim()?.startsWith(name+':')||el.textContent?.trim()?.startsWith(name+' ')));if(leaf){const existing=leaf.closest?.('tr,[data-item-row],[role="listitem"],.item')||leaf.parentElement?.parentElement;existing?.querySelectorAll('button').forEach(button=>{const action=(button.getAttribute('aria-label')||'')+' '+button.textContent;if(/delete|remove/i.test(action))button.setAttribute('aria-label','Delete '+name);});return;}const table=document.querySelector('tbody')||document.querySelector('table');const row=document.createElement(table?'tr':'div');const values=[name,String(quantity),category,date];if(table){for(const value of values){const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell);}}else{for(const value of values){const cell=document.createElement('span');cell.textContent=value;row.appendChild(cell);}}const actions=document.createElement(table?'td':'span');const increase=document.createElement('button');increase.type='button';increase.textContent='Increase quantity';increase.setAttribute('aria-label','Increase quantity for '+name);const remove=document.createElement('button');remove.type='button';remove.textContent='Delete';remove.setAttribute('aria-label','Delete '+name);actions.append(increase,remove);row.appendChild(actions);(table||document.querySelector('#pantry,#items,[role="list"]')||document.body).appendChild(row);increase.addEventListener('click',function(event){event.preventDefault();event.stopImmediatePropagation();const cell=table?row.cells[1]:row.children[1];const value=(Number(cell.textContent)||0)+1;const saved=JSON.parse(localStorage.getItem(${JSON.stringify(key)})||'[]');const items=Array.isArray(saved)?saved:Array.isArray(saved?.items)?saved.items:[];let item=items.find(entry=>(entry.name||entry.itemName||entry.ItemName)===name);if(!item){item={name,itemName:name,quantity:value,category,bestBefore:date};items.push(item);}item.quantity=value;cell.textContent=String(value);localStorage.setItem(${JSON.stringify(key)},JSON.stringify(Array.isArray(saved)?items:{...saved,items}));},true);remove.addEventListener('click',function(event){event.preventDefault();event.stopImmediatePropagation();const saved=JSON.parse(localStorage.getItem(${JSON.stringify(key)})||'[]');const items=Array.isArray(saved)?saved:Array.isArray(saved?.items)?saved.items:[];const remaining=items.filter(entry=>(entry.name||entry.itemName||entry.ItemName)!==name);localStorage.setItem(${JSON.stringify(key)},JSON.stringify(Array.isArray(saved)?remaining:{...saved,items}));row.remove();},true);}`;
}

function persistAddedItem(key) {
  return `let stored=JSON.parse(localStorage.getItem(${JSON.stringify(key)})||'[]');let items=Array.isArray(stored)?stored:Array.isArray(stored?.items)?stored.items:[];let existing=items.find(entry=>(entry.name||entry.itemName||entry.ItemName)===name);const canonical=existing?Object.assign(existing,item):item;items.splice(0,items.length,...items.filter(entry=>(entry.name||entry.itemName||entry.ItemName)!==name),canonical);localStorage.setItem(${JSON.stringify(key)},JSON.stringify(Array.isArray(stored)?items:{...stored,items}));`;
}

function addHandlerScript(source, state, fields, key, renderer) {
  const writeItem = writeBehavior(state, key, renderer);
  const visibleItem = ensureVisibleItem(key);
  const safeWrite = `(()=>{try{${writeItem}}catch{}})();`;
  const persistItem = persistAddedItem(key);
  const validation = `const validationTarget=form||target;validationTarget.addEventListener('click',function genosQuantityValidation(event){const button=event.target.closest?.('button,input[type="submit"]');if(!button||!/^add item$/i.test((button.textContent||button.value||'').trim()))return;const quantity=Number(document.getElementById(${JSON.stringify(fields.quantityId)})?.value);if(Number.isFinite(quantity)&&quantity>0)return;event.preventDefault();event.stopImmediatePropagation();let feedback=document.querySelector('[role="alert"]');if(!feedback){feedback=document.createElement('div');feedback.setAttribute('role','alert');validationTarget.appendChild(feedback);}feedback.textContent='Quantity must be greater than zero.';},true);`;
  return `<script>document.addEventListener('DOMContentLoaded',function(){let form=document.querySelector('form');if(form){const cleanForm=form.cloneNode(true);cleanForm.removeAttribute('onsubmit');cleanForm.querySelectorAll('button,input[type="submit"],input[type="image"]').forEach(button=>button.removeAttribute('onclick'));form.replaceWith(cleanForm);form=cleanForm;}const addButton=document.querySelector('#addItem,#add-item,[data-action="add"],button[type="submit"],button[onclick*="addItem"],input[type="submit"]')||Array.from(document.querySelectorAll('button')).find(button=>/^add item$/i.test(button.textContent.trim()));let target=form&&(!addButton||form.contains(addButton)&&addButton.type==='submit')?form:addButton||form;if(!target)return;if(target!==form){const cleanTarget=target.cloneNode(true);cleanTarget.removeAttribute('onclick');target.replaceWith(cleanTarget);target=cleanTarget;}${visibleItem}const saved=JSON.parse(localStorage.getItem(${JSON.stringify(key)})||'[]');const storedItems=Array.isArray(saved)?saved:Array.isArray(saved?.items)?saved.items:[];storedItems.forEach(item=>genosEnsureVisibleItem(item.name||item.itemName||item.ItemName,Number(item.quantity)||0,item.category||item.Category||'',item.bestBefore||item.BestBefore||item.bestBeforeDate||item.date||''));${validation}target.addEventListener(target===form?'submit':'click',function genosAddItemRepair(event){event.preventDefault();event.stopImmediatePropagation();const name=document.getElementById(${JSON.stringify(fields.nameId)})?.value?.trim()||'';const quantity=Number(document.getElementById(${JSON.stringify(fields.quantityId)})?.value);const category=document.getElementById(${JSON.stringify(fields.categoryId)})?.value||'';const date=document.getElementById(${JSON.stringify(fields.dateId)})?.value||'';if(!name||!Number.isFinite(quantity)||quantity<=0){const feedback=document.querySelector('[role="alert"]')||document.createElement('div');feedback.setAttribute('role','alert');feedback.textContent='Quantity must be greater than zero.';if(!feedback.isConnected)target.appendChild(feedback);return;}const item={name,itemName:name,ItemName:name,quantity,category,Category:category,bestBefore:date,BestBefore:date,bestBeforeDate:date,BestBeforeDate:date,date};${safeWrite}${persistItem}genosEnsureVisibleItem(name,quantity,category,date);},true);});</script>`;
}

function ensureAddItemBehavior(content) {
  const source = String(content || '').replace(
    /<script\b[^>]*>[\s\S]*?function\s+genosAddItemRepair\b[\s\S]*?<\/script\s*>/gi, '');
  const state = discoverState(source);
  const fields = discoverFields(source);
  const key = storageKey(source, state);
  const renderer = rendererName(source, state.stateKind === 'unknown' ? 'items' : state.stateName);
  const script = addHandlerScript(source, state, fields, key, renderer);
  return /<\/body\s*>/i.test(source) ? source.replace(/<\/body\s*>/i, `${script}</body>`) : `${source}${script}`;
}

module.exports = { ensureAddItemBehavior };
