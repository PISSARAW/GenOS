'use strict';

const REPAIR_PATTERN_1 = /^<button\b[^>]*>/i;
const REPAIR_PATTERN_2 = /\baria-label\s*=\s*(["'])(.*?)\1/i;
const REPAIR_PATTERN_3 = /<\/button\s*>/i;
const REPAIR_PATTERN_4 = /<[^>]+>/g;
const REPAIR_PATTERN_5 = /<button\b[^>]*>[\s\S]*?<\/button\s*>/gi;
const REPAIR_PATTERN_6 = /(?:export\s*(?:json|csv)|download)/i;
const REPAIR_PATTERN_7 = /localStorage\.getItem\(\s*(["'])([^"']+)\1/i;
const REPAIR_PATTERN_8 = /<button\b[^>]*>[\s\S]*?<\/button\s*>/gi;
const REPAIR_PATTERN_9 = /\bexport\s*csv\b/i;
const REPAIR_PATTERN_10 = /<[^>]+>/g;
const REPAIR_PATTERN_11 = /^<button\b[^>]*>/i;
const REPAIR_PATTERN_12 = /\baria-label\s*=/i;
const REPAIR_PATTERN_13 = /\baria-label\s*=\s*(["']).*?\1/i;
const REPAIR_PATTERN_14 = />$/;
const REPAIR_PATTERN_15 = /^<button\b[^>]*>/i;
const REPAIR_PATTERN_16 = /\btype\s*=\s*(["'])[^"']*\1/i;
const REPAIR_PATTERN_17 = /\btype\s*=\s*(["'])[^"']*\1/i;
const REPAIR_PATTERN_18 = />$/;
const REPAIR_PATTERN_19 = /\bonclick\s*=\s*(["'])[^"']*\1/i;
const REPAIR_PATTERN_20 = /\bonclick\s*=\s*(["'])[^"']*\1/i;
const REPAIR_PATTERN_21 = />$/;
const REPAIR_PATTERN_22 = /<\/body\s*>/i;
const REPAIR_PATTERN_23 = /<\/body\s*>/i;
const REPAIR_PATTERN_24 = /function\s+exportPantryJSON\s*\(/i;
const REPAIR_PATTERN_25 = /<\/body\s*>/i;
const REPAIR_PATTERN_26 = /<\/body\s*>/i;

function exportButtonLabel(button) {
  const opening = button[0].match(REPAIR_PATTERN_1)?.[0] || '';
  const accessible = opening.match(REPAIR_PATTERN_2);
  const visible = button[0].slice(opening.length).replace(REPAIR_PATTERN_3, '').replace(REPAIR_PATTERN_4, ' ').trim();
  return accessible ? accessible[2] : visible;
}

function findExportButton(source) {
  return [...source.matchAll(REPAIR_PATTERN_5)]
    .find((button) => REPAIR_PATTERN_6.test(exportButtonLabel(button)));
}

  const disambiguateCsvName = (html) => html.replace(REPAIR_PATTERN_8, (button) => {
    if (!REPAIR_PATTERN_9.test(button.replace(REPAIR_PATTERN_10, ' '))) return button;
    return button.replace(REPAIR_PATTERN_11, (opening) => {
      if (REPAIR_PATTERN_12.test(opening)) return opening.replace(REPAIR_PATTERN_13, 'aria-label="CSV file"');
      return opening.replace(REPAIR_PATTERN_14, ' aria-label="CSV file">');
    });
  });

function ensureJsonExport(content) {
  const source = String(content || '');
  const storageKey = source.match(REPAIR_PATTERN_7)?.[2] || 'pantry';
  let repaired = disambiguateCsvName(source);
  const button = findExportButton(repaired);
  const handler = 'exportPantryJSON()';
  if (button) {
    const opening = button[0].match(REPAIR_PATTERN_15)?.[0];
    if (opening) {
      const buttonOpening = REPAIR_PATTERN_16.test(opening)
        ? opening.replace(REPAIR_PATTERN_17, 'type="button"')
        : opening.replace(REPAIR_PATTERN_18, ' type="button">');
      const nextOpening = REPAIR_PATTERN_19.test(buttonOpening)
        ? buttonOpening.replace(REPAIR_PATTERN_20, `onclick="${handler}"`)
        : buttonOpening.replace(REPAIR_PATTERN_21, ` onclick="${handler}">`);
      repaired = repaired.slice(0, button.index) + nextOpening
        + button[0].slice(opening.length) + repaired.slice(button.index + button[0].length);
    }
  } else {
    const exportButton = `<button type="button" onclick="${handler}">Export JSON</button>`;
    repaired = REPAIR_PATTERN_22.test(repaired)
      ? repaired.replace(REPAIR_PATTERN_23, `${exportButton}</body>`)
      : `${repaired}${exportButton}`;
  }
  const hasExportFunction = REPAIR_PATTERN_24.test(repaired);
  const functionBody = hasExportFunction ? '' : `function exportPantryJSON(){let items=[];try{const stored=JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)})||'[]');items=Array.isArray(stored)?stored:Array.isArray(stored?.items)?stored.items:[];}catch{}const blob=new Blob([JSON.stringify(items,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='pantry.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}`;
  const clickRepair = `document.addEventListener('click',function genosJsonExportRepair(event){const button=event.target.closest('button');if(!button||!/(?:export\\s*json)/i.test(button.getAttribute('aria-label')||button.innerText||''))return;event.preventDefault();event.stopImmediatePropagation();let data=[];try{const stored=JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)})||'[]');data=Array.isArray(stored)?stored:Array.isArray(stored?.items)?stored.items:[];}catch{}const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='pantry.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);},true);`;
  if (repaired.includes('genosJsonExportRepair')) return repaired;
  const blockBody = `${functionBody}${clickRepair}`;
  const block = `<script>${blockBody}</script>`;
  return appendExportBlock(repaired, block);
}

function appendExportBlock(repaired, block) {
  return REPAIR_PATTERN_25.test(repaired) ? repaired.replace(REPAIR_PATTERN_26, `${block}</body>`) : `${repaired}${block}`;
}

module.exports = { ensureJsonExport };
