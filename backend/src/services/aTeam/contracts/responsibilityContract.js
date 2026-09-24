'use strict';

const { isRecord, isStringList, result } = require('./contractValidation');

const RESPONSIBILITY_FIELDS = Object.freeze([
  'owns', 'mayModify', 'mayPropose', 'mustConsult', 'mayRead', 'cannotOverride'
]);

function validateResponsibility(value) {
  const errors = [];
  if (!isRecord(value)) return result(['Responsibility contract must be an object.']);
  for (const field of RESPONSIBILITY_FIELDS) {
    if (!isStringList(value[field])) errors.push(`${field} must be an array of non-empty strings.`);
  }
  return result(errors);
}

module.exports = { RESPONSIBILITY_FIELDS, validateResponsibility };
