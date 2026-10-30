'use strict';

const REPAIR_PATTERN_1 = /\baria-label\s*=\s*(["'])[^"']*\1/i;
const REPAIR_PATTERN_2 = /\baria-label\s*=\s*(["'])[^"']*\1/i;
const REPAIR_PATTERN_3 = />$/;
const REPAIR_PATTERN_4 = /\b(?:id|name)\s*=\s*["'][^"']*item.?category/i;
const REPAIR_PATTERN_5 = /\b(?:id|name)\s*=\s*["']category["']/i;
const REPAIR_PATTERN_6 = /<select\b[^>]*>[\s\S]*?<\/select\s*>/gi;
const REPAIR_PATTERN_7 = /<select\b[^>]*>/gi;
const REPAIR_PATTERN_8 = /<form\b[^>]*>[\s\S]*?<\/form\s*>/gi;
const REPAIR_PATTERN_9 = /add\s*item|type\s*=\s*["']submit/i;
const REPAIR_PATTERN_10 = /<button\b[^>]*>[\s\S]*?add\s*item[\s\S]*?<\/button\s*>/i;
const REPAIR_PATTERN_11 = /<\/body\s*>/i;
const REPAIR_PATTERN_12 = /<\/body\s*>/i;

function setName(opening, label) {
  if (REPAIR_PATTERN_1.test(opening)) {
    return opening.replace(REPAIR_PATTERN_2, `aria-label="${label}"`);
  }
  return opening.replace(REPAIR_PATTERN_3, ` aria-label="${label}">`);
}

function targetIndex(selects) {
  const addField = selects.findIndex((select) => REPAIR_PATTERN_4.test(select[0]));
  if (addField >= 0) return addField;
  const category = selects.findIndex((select) => REPAIR_PATTERN_5.test(select[0]));
  return category >= 0 ? category : 0;
}

function ensureUniqueCategorySelect(content) {
  const selects = [...content.matchAll(REPAIR_PATTERN_6)];
  if (selects.length < 2) return content;
  const keep = targetIndex(selects);
  let index = 0;
  return content.replace(REPAIR_PATTERN_7, (opening) => {
    const label = index++ === keep ? 'Category' : 'Filter category';
    return setName(opening, label);
  });
}

function ensureAccessibleCategorySelect(content, label = 'Category') {
  const forms = [...content.matchAll(REPAIR_PATTERN_8)];
  const addForm = forms.find((form) => REPAIR_PATTERN_9.test(form[0])) || forms[0];
  const field = `<label for="category">${label}</label><select id="category" name="category" aria-label="${label}"><option value="Food">Food</option><option value="Hygiene">Hygiene</option><option value="Household">Household</option></select>`;
  if (addForm) {
    const end = addForm.index + addForm[0].length - '</form>'.length;
    return content.slice(0, end) + field + content.slice(end);
  }
  const button = REPAIR_PATTERN_10.exec(content);
  if (button) return content.slice(0, button.index) + field + content.slice(button.index);
  return REPAIR_PATTERN_11.test(content) ? content.replace(REPAIR_PATTERN_12, `${field}</body>`) : `${content}${field}`;
}

module.exports = { ensureUniqueCategorySelect, ensureAccessibleCategorySelect };
