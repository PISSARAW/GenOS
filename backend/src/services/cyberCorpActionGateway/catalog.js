'use strict';

const OPERATIONS = Object.freeze({
  read_gpo_config: operation('low', 'read', 'gpo', { computer: 'string' }),
  export_windows_logs: operation('low', 'read', 'host', { computer: 'string', channel: 'logChannel' }),
  compare_pfsense_rules: operation('low', 'read', 'pfsense', { firewall: 'string', baselineId: 'string' }),
  modify_test_vm_setting: operation('moderate', 'write', 'test_vm', { setting: 'vmSetting', value: 'scalar' }),
  modify_lab_pfsense_rule: operation('high', 'write', 'lab_pfsense', { ruleId: 'string', enabled: 'boolean' }),
  modify_domain_gpo: operation('high', 'write', 'domain_gpo', { gpoId: 'string', setting: 'gpoSetting', value: 'scalar' }),
  delete_accounts: operation('prohibited', 'write', 'account', { accountId: 'string' }),
  delete_logs: operation('prohibited', 'write', 'host', { computer: 'string', channel: 'logChannel' }),
  delete_backups: operation('prohibited', 'write', 'backup', { backupId: 'string' })
});

function operation(risk, effect, targetKind, fields) {
  return Object.freeze({ risk, effect, targetKind, fields: Object.freeze(fields) });
}

function validateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'OBJECT_REQUIRED';
  const keys = Object.keys(body).sort().join(',');
  if (keys !== 'expectedStateVersion,idempotencyKey,mandateId,operationId,parameters,target') return 'REQUEST_FIELDS_INVALID';
  const definition = OPERATIONS[body.operationId];
  if (!definition) return 'OPERATION_NOT_ALLOWED';
  if (typeof body.target !== 'string' || !body.target.trim() || body.target.length > 256) return 'TARGET_INVALID';
  if (!body.target.startsWith(`${definition.targetKind}:`) || !body.target.slice(definition.targetKind.length + 1).trim()) return 'TARGET_KIND_MISMATCH';
  if (typeof body.mandateId !== 'string' || !body.mandateId.trim()) return 'MANDATE_REQUIRED';
  if (typeof body.idempotencyKey !== 'string' || !body.idempotencyKey.trim() || body.idempotencyKey.length > 128) return 'IDEMPOTENCY_KEY_REQUIRED';
  if (typeof body.expectedStateVersion !== 'string' || !body.expectedStateVersion.trim()) return 'STATE_VERSION_REQUIRED';
  if (!validParameters(body.parameters, definition.fields)) return 'PARAMETERS_INVALID';
  return null;
}

function validParameters(parameters, fields) {
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) return false;
  if (Object.keys(parameters).sort().join(',') !== Object.keys(fields).sort().join(',')) return false;
  if (!Object.entries(fields).every(([key, type]) => validValue(parameters[key], type))) return false;
  return validEnumeratedValues(parameters);
}

function validEnumeratedValues(parameters) {
  if (parameters.setting === 'firewallEnabled' || parameters.setting === 'networkIsolation'
    || parameters.setting === 'rdpEnabled') return typeof parameters.value === 'boolean';
  if (parameters.setting === 'auditPolicy') return ['success', 'failure', 'all'].includes(parameters.value);
  if (parameters.setting === 'passwordPolicy') return ['baseline', 'strict'].includes(parameters.value);
  if (parameters.setting === 'firewallPolicy') return ['enabled', 'disabled'].includes(parameters.value);
  return true;
}

function validValue(value, type) {
  if (type === 'string') return typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'scalar') return ['string', 'number', 'boolean'].includes(typeof value)
    && (typeof value !== 'number' || Number.isFinite(value));
  if (type === 'logChannel') return ['Security', 'System', 'Application'].includes(value);
  if (type === 'vmSetting') return ['firewallEnabled', 'networkIsolation', 'rdpEnabled'].includes(value);
  if (type === 'gpoSetting') return ['auditPolicy', 'passwordPolicy', 'firewallPolicy'].includes(value);
  return false;
}

module.exports = { OPERATIONS, validateRequest };
