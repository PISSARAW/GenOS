'use strict';

function setName(opening, label) {
  if (/\baria-label\s*=\s*(["'])[^"']*\1/i.test(opening)) {
    return opening.replace(/\baria-label\s*=\s*(["'])[^"']*\1/i, `aria-label="${label}"`);
  }
  return opening.replace(/>$/, ` aria-label="${label}">`);
}

function targetIndex(selects) {
  const addField = selects.findIndex((select) => /\b(?:id|name)\s*=\s*["'][^"']*item.?category/i.test(select[0]));
  if (addField >= 0) return addField;
  const category = selects.findIndex((select) => /\b(?:id|name)\s*=\s*["']category["']/i.test(select[0]));
  return category >= 0 ? category : 0;
}

function ensureUniqueCategorySelect(content) {
  const selects = [...content.matchAll(/<select\b[^>]*>[\s\S]*?<\/select\s*>/gi)];
  if (selects.length < 2) return content;
  const keep = targetIndex(selects);
  let index = 0;
  return content.replace(/<select\b[^>]*>/gi, (opening) => {
    const label = index++ === keep ? 'Category' : 'Filter category';
    return setName(opening, label);
  });
}

module.exports = { ensureUniqueCategorySelect };
