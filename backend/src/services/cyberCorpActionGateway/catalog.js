'use strict';

const OPERATIONS = Object.freeze({
  read_gpo_config: operation({ risk: 'low', effect: 'read', targetKind: 'gpo', fields: { computer: 'string' } }),
  export_windows_logs: operation({ risk: 'low', effect: 'read', targetKind: 'host', fields: { computer: 'string', channel: 'logChannel' } }),
  compare_pfsense_rules: operation({ risk: 'low', effect: 'read', targetKind: 'pfsense', fields: { firewall: 'string', baselineId: 'string' } }),
  modify_test_vm_setting: operation({ risk: 'moderate', effect: 'write', targetKind: 'test_vm', fields: { setting: 'vmSetting', value: 'scalar' } }),
  modify_lab_pfsense_rule: operation({ risk: 'high', effect: 'write', targetKind: 'lab_pfsense', fields: { ruleId: 'string', enabled: 'boolean' } }),
  modify_domain_gpo: operation({ risk: 'high', effect: 'write', targetKind: 'domain_gpo', fields: { gpoId: 'string', setting: 'gpoSetting', value: 'scalar' } }),
  delete_accounts: operation({ risk: 'prohibited', effect: 'write', targetKind: 'account', fields: { accountId: 'string' } }),
  delete_logs: operation({ risk: 'prohibited', effect: 'write', targetKind: 'host', fields: { computer: 'string', channel: 'logChannel' } }),
  delete_backups: operation({ risk: 'prohibited', effect: 'write', targetKind: 'backup', fields: { backupId: 'string' } })
});

const BOOLEAN_SETTINGS = new Set(['firewallEnabled', 'networkIsolation', 'rdpEnabled']);
const ENUMERATED_SETTINGS = Object.freeze({
  auditPolicy: ['success', 'failure', 'all'],
  passwordPolicy: ['baseline', 'strict'],
  firewallPolicy: ['enabled', 'disabled']
});
const VALIDATORS = Object.freeze({
  string: validString,
  boolean: validBoolean,
  scalar: validScalar,
  logChannel: (value) => ['Security', 'System', 'Application'].includes(value),
  vmSetting: (value) => BOOLEAN_SETTINGS.has(value),
  gpoSetting: (value) => Object.hasOwn(ENUMERATED_SETTINGS, value)
});

function operation(input) {
  const { risk, effect, targetKind, fields } = input;
  return Object.freeze({ risk, effect, targetKind, fields: Object.freeze(fields) });
}

function validateRequest(body) {
  if (!isObject(body)) return 'OBJECT_REQUIRED';
  const shapeError = validateRequestShape(body);
  if (shapeError) return shapeError;
  const definition = OPERATIONS[body.operationId];
  if (!definition) return 'OPERATION_NOT_ALLOWED';
  const targetError = validateTarget(body.target, definition.targetKind);
  if (targetError) return targetError;
  const identityError = validateRequestIdentity(body);
  if (identityError) return identityError;
  if (!validParameters(body.parameters, definition.fields)) return 'PARAMETERS_INVALID';
  return null;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateRequestShape(body) {
  const keys = Object.keys(body).sort().join(',');
  return keys === 'expectedStateVersion,idempotencyKey,mandateId,operationId,parameters,target'
    ? null : 'REQUEST_FIELDS_INVALID';
}

function validateTarget(target, targetKind) {
  if (typeof target !== 'string' || !target.trim() || target.length > 256) return 'TARGET_INVALID';
  return target.startsWith(`${targetKind}:`) && target.slice(targetKind.length + 1).trim()
    ? null : 'TARGET_KIND_MISMATCH';
}

function validateRequestIdentity(body) {
  if (typeof body.mandateId !== 'string' || !body.mandateId.trim()) return 'MANDATE_REQUIRED';
  if (typeof body.idempotencyKey !== 'string' || !body.idempotencyKey.trim() || body.idempotencyKey.length > 128) {
    return 'IDEMPOTENCY_KEY_REQUIRED';
  }
  return typeof body.expectedStateVersion === 'string' && body.expectedStateVersion.trim()
    ? null : 'STATE_VERSION_REQUIRED';
}

function validParameters(parameters, fields) {
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) return false;
  if (Object.keys(parameters).sort().join(',') !== Object.keys(fields).sort().join(',')) return false;
  if (!Object.entries(fields).every(([key, type]) => validValue(parameters[key], type))) return false;
  return validEnumeratedValues(parameters);
}

function validEnumeratedValues(parameters) {
  if (BOOLEAN_SETTINGS.has(parameters.setting)) return typeof parameters.value === 'boolean';
  const allowedValues = ENUMERATED_SETTINGS[parameters.setting];
  return !allowedValues || allowedValues.includes(parameters.value);
}

function validValue(value, type) {
  const validator = VALIDATORS[type];
  return typeof validator === 'function' && validator(value);
}

function validString(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
}

function validBoolean(value) {
  return typeof value === 'boolean';
}

function validScalar(value) {
  const allowedType = ['string', 'number', 'boolean'].includes(typeof value);
  return allowedType && (typeof value !== 'number' || Number.isFinite(value));
}

module.exports = { OPERATIONS, validateRequest };
