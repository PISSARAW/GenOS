'use strict';
const allowed = new Set(['caseScope', 'differentialConsiderations', 'uncertainty', 'safetyNote', 'evidence',
  'missingInformation', 'emergencyWarningSigns']);
function sectionsValid(content) {
  return ['missingInformation', 'emergencyWarningSigns'].every(key => content[key] === undefined
    || (Array.isArray(content[key]) && content[key].every(value => typeof value === 'string' && value.trim().length > 0)));
}
function valid(content, hasDirective) {
  return content.caseScope === 'synthetic_educational'
    && Object.keys(content).every(key => allowed.has(key))
    && sectionsValid(content) && !hasDirective(content);
}
module.exports = { valid };
