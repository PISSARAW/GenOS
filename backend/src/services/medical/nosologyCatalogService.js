'use strict';

const catalog = require('../../../../shared/nosology.json');
const unitTherapies = new Set(catalog.therapies.map(item => item.id));
['Tocilizumab', 'Antiviral', 'DetoxificationWashout', 'HomeostaticDoseCorrection',
  'StemCellReplacement'].forEach(name => unitTherapies.add(name));

function singleText(value, key) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 1 && Object.hasOwn(value, key) && typeof value[key] === 'string' && value[key].trim().length > 0;
}

const payloadValidators = {
  Corticosteroids: value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1,
  Vaccine: value => typeof value === 'string' && value.trim().length > 0,
  QuarantineIsolation: value => singleText(value, 'capsule_id'),
  AntisepticPurge: value => singleText(value, 'target_signature'),
  AntidoteAdmin: value => singleText(value, 'target_drug'),
  TelomeraseActivation: value => value && Object.keys(value).length === 1
    && Number.isInteger(value.extended_ticks) && value.extended_ticks >= 0 && value.extended_ticks <= 0xffffffff,
};

function validPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && Object.hasOwn(payloadValidators, keys[0])
    && Boolean(payloadValidators[keys[0]](value[keys[0]]));
}

function validateTherapy(value) {
  const valid = typeof value === 'string' ? unitTherapies.has(value) : validPayload(value);
  if (!valid) throw Object.assign(new Error('Unknown or invalid nosological therapy'), {
    code: 'INVALID_THERAPY', status: 400,
  });
  return value;
}

module.exports = { catalog, validateTherapy };
