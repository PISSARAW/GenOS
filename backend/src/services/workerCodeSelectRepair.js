'use strict';

function replaceAccessibleName(opening, label) {
  if (/\baria-label\s*=\s*(["'])[^"']*\1/i.test(opening)) return opening.replace(/\baria-label\s*=\s*(["'])[^"']*\1/i, `aria-label="${label}"`);
  return opening.replace(/>$/, ` aria-label="${label}">`);
}

function labelFilterSelect(content, label) {
  const forms = [...content.matchAll(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi)];
  const selects = [...content.matchAll(/<select\b[^>]*>[\s\S]*?<\/select\s*>/gi)];
  const categoryOnly = selects.length === 1 && /\bid\s*=\s*["']category["']/i.test(selects[0][0]);
  if (categoryOnly) {
    const target = selects[0];
    const filter = `<select id="filterCategory" aria-label="${label}"><option value="all">All</option><option value="Food">Food</option></select>`;
    const end = target.index + target[0].length;
    return content.slice(0, end) + filter + content.slice(end);
  }
  const outsideForm = (select) => !forms.some((form) => select.index >= form.index && select.index < form.index + form[0].length);
  const target = selects.find((select) => outsideForm(select) && (/\bid\s*=\s*["'][^"']*(?:filter|search)[^"']*["']/i.test(select[0]) || /<option\b[^>]*>\s*(?:All|Any|Every)/i.test(select[0]))) || selects.find(outsideForm) || selects[1];
  if (!target) return content;
  const opening = target[0].match(/^<select\b[^>]*>/i)?.[0];
  if (!opening) return content;
  let next = replaceAccessibleName(opening, label) + target[0].slice(opening.length);
  if (!/<option\b[^>]*>\s*Food\s*<\/option\s*>/i.test(next) && !/<option\b[^>]*value\s*=\s*["']Food["']/i.test(next)) next = next.replace(/<\/select\s*>/i, '<option value="Food">Food</option></select>');
  return content.slice(0, target.index) + next + content.slice(target.index + target[0].length);
}

module.exports = { labelFilterSelect };
