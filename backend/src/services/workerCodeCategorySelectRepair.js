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

function ensureAccessibleCategorySelect(content, label = 'Category') {
  const forms = [...content.matchAll(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi)];
  const addForm = forms.find((form) => /add\s*item|type\s*=\s*["']submit/i.test(form[0])) || forms[0];
  const field = `<label for="category">${label}</label><select id="category" name="category" aria-label="${label}"><option value="Food">Food</option><option value="Hygiene">Hygiene</option><option value="Household">Household</option></select>`;
  if (addForm) {
    const end = addForm.index + addForm[0].length - '</form>'.length;
    return content.slice(0, end) + field + content.slice(end);
  }
  const button = /<button\b[^>]*>[\s\S]*?add\s*item[\s\S]*?<\/button\s*>/i.exec(content);
  if (button) return content.slice(0, button.index) + field + content.slice(button.index);
  return /<\/body\s*>/i.test(content) ? content.replace(/<\/body\s*>/i, `${field}</body>`) : `${content}${field}`;
}

module.exports = { ensureUniqueCategorySelect, ensureAccessibleCategorySelect };
