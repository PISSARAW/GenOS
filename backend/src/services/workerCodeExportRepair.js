'use strict';

function ensureJsonExport(content) {
  const source = String(content || '');
  const stateName = source.match(/\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[\s*\]/i)?.[1] || 'pantry';
  const storageKey = source.match(/localStorage\.getItem\(\s*(["'])([^"']+)\1/i)?.[2] || 'pantry';
  const buttonPattern = /<button\b[^>]*>[\s\S]*?(?:export\s*(?:json|csv)|download)[\s\S]*?<\/button\s*>/i;
  const button = buttonPattern.exec(source);
  const handler = 'exportPantryJSON()';
  let repaired = source;
  if (button) {
    const opening = button[0].match(/^<button\b[^>]*>/i)?.[0];
    if (opening) {
      const buttonOpening = /\btype\s*=\s*(["'])[^"']*\1/i.test(opening)
        ? opening.replace(/\btype\s*=\s*(["'])[^"']*\1/i, 'type="button"')
        : opening.replace(/>$/, ' type="button">');
      const nextOpening = /\bonclick\s*=\s*(["'])[^"']*\1/i.test(buttonOpening)
        ? buttonOpening.replace(/\bonclick\s*=\s*(["'])[^"']*\1/i, `onclick="${handler}"`)
        : buttonOpening.replace(/>$/, ` onclick="${handler}">`);
      repaired = repaired.slice(0, button.index) + nextOpening
        + button[0].slice(opening.length) + repaired.slice(button.index + button[0].length);
    }
  } else {
    const exportButton = `<button type="button" onclick="${handler}">Export JSON</button>`;
    repaired = /<\/body\s*>/i.test(repaired)
      ? repaired.replace(/<\/body\s*>/i, `${exportButton}</body>`)
      : `${repaired}${exportButton}`;
  }
  const hasExportFunction = /function\s+exportPantryJSON\s*\(/i.test(repaired);
  const functionBody = hasExportFunction ? '' : `function exportPantryJSON(){const blob=new Blob([JSON.stringify(${stateName},null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='pantry.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}`;
  const script = [...repaired.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)].at(-1);
  const clickRepair = `document.addEventListener('click',function genosJsonExportRepair(event){const button=event.target.closest('button');if(!button||!/(?:export\\s*(?:json|csv)|download)/i.test(button.innerText||button.getAttribute('aria-label')||''))return;event.preventDefault();event.stopImmediatePropagation();let data=[];try{const stored=JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)})||'[]');data=Array.isArray(stored)?stored:Array.isArray(stored?.items)?stored.items:[];}catch{}const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='pantry.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);},true);`;
  if (repaired.includes('genosJsonExportRepair')) return repaired;
  const blockBody = `${functionBody}${clickRepair}`;
  if (script) return repaired.slice(0, script.index + script[0].length - 9)
    + blockBody + repaired.slice(script.index + script[0].length - 9);
  const block = `<script>${blockBody}</script>`;
  return /<\/body\s*>/i.test(repaired) ? repaired.replace(/<\/body\s*>/i, `${block}</body>`) : `${repaired}${block}`;
}

module.exports = { ensureJsonExport };
