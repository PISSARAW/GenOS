'use strict';

function replaceAccessibleName(opening, label) {
  if (/\baria-label\s*=\s*(["'])[^"']*\1/i.test(opening)) return opening.replace(/\baria-label\s*=\s*(["'])[^"']*\1/i, `aria-label="${label}"`);
  return opening.replace(/>$/, ` aria-label="${label}">`);
}

function makeVisible(opening) {
  return opening.replace(/\s+hidden(?=\s|\/?>)/gi, '').replace(/\s+aria-hidden\s*=\s*(["'])true\1/gi, '')
    .replace(/\s+style\s*=\s*(["'])(.*?)\1/i, (attribute, quote, style) => {
      const visible = style.split(';').filter((rule) => !/(?:^|\s*)(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(rule.trim()));
      return visible.some((rule) => rule.trim()) ? ` style="${visible.join(';')}"` : '';
    });
}

function exposeControl(content, target) {
  let repaired = content;
  const opening = target[0].match(/^<select\b[^>]*>/i)?.[0];
  if (opening) repaired = repaired.slice(0, target.index)
    + makeVisible(opening) + repaired.slice(target.index + opening.length);
  const formStart = content.lastIndexOf('<form', target.index);
  const formEnd = content.indexOf('</form', target.index);
  if (formStart >= 0 && formEnd >= target.index) {
    const formOpening = content.slice(formStart).match(/^<form\b[^>]*>/i)?.[0];
    if (formOpening) repaired = repaired.slice(0, formStart)
      + makeVisible(formOpening) + repaired.slice(formStart + formOpening.length);
  }
  return repaired;
}

function filterTarget(content, selects) {
  const forms = [...content.matchAll(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi)];
  const outsideForm = (select) => !forms.some((form) => select.index >= form.index && select.index < form.index + form[0].length);
  return selects.find((select) => outsideForm(select) && (/\bid\s*=\s*["'][^"']*(?:filter|search)[^"']*["']/i.test(select[0]) || /<option\b[^>]*>\s*(?:All|Any|Every)/i.test(select[0]))) || selects.find(outsideForm) || selects[1];
}

function labelFilterSelect(content, label) {
  const selects = [...content.matchAll(/<select\b[^>]*>[\s\S]*?<\/select\s*>/gi)];
  if (selects.length === 1 && /\bid\s*=\s*["']category["']/i.test(selects[0][0])) {
    const end = selects[0].index + selects[0][0].length;
    return content.slice(0, end) + `<select id="filterCategory" aria-label="${label}"><option value="all">All</option><option value="Food">Food</option></select>` + content.slice(end);
  }
  const target = filterTarget(content, selects);
  if (!target) return content;
  const opening = target[0].match(/^<select\b[^>]*>/i)?.[0];
  if (!opening) return content;
  let next = makeVisible(replaceAccessibleName(opening, label)) + target[0].slice(opening.length);
  if (!/<option\b[^>]*>\s*Food\s*<\/option\s*>/i.test(next) && !/<option\b[^>]*value\s*=\s*["']Food["']/i.test(next)) next = next.replace(/<\/select\s*>/i, '<option value="Food">Food</option></select>');
  const repaired = content.slice(0, target.index) + next + content.slice(target.index + target[0].length);
  return exposeControl(repaired, { index: target.index, 0: next });
}

module.exports = { labelFilterSelect };
