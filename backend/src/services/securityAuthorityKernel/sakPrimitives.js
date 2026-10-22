'use strict';

const crypto = require('node:crypto');
const { canonicalValue, fingerprint } = require('../stateFingerprint');

const KERNEL_SCHEMA = 'genos.security-authority-kernel/v1';
const OBSERVED_ENVELOPE_SCHEMA = 'genos.security-observed-data-envelope/v1';
const GRANT_SCHEMA = 'genos.security-permission-grant/v1';
const PERMIT_SCHEMA = 'genos.security-execution-permit/v1';
const AUDIT_ENTRY_SCHEMA = 'genos.security-auth-log-entry/v1';

const PRINCIPAL_KINDS = Object.freeze(['agent', 'operator', 'actuator']);
const MAX_GRANT_DURATION_MS = 24 * 60 * 60 * 1000;

const ALLOWED_SECURITY_OPERATIONS = Object.freeze([
  'isolate_host',
  'revoke_session',
  'block_network_port',
  'remove_firewall_rule',
  'collect_forensic_snapshot',
  'quarantine_artifact',
  'rotate_credential',
  'apply_verified_patch',
  'inspect_telemetry'
]);

const OBSERVED_SOURCES = Object.freeze([
  'evtx',
  'windows_event_log',
  'audit_report',
  'security_report',
  'syslog',
  'pcap',
  'sarif',
  'observed_data'
]);

const MODEL_BYPASS_FLAGS = Object.freeze([
  'bypassAuthorization',
  'ignorePolicy',
  'forceAllow',
  'modelOverride',
  'selfAuthorized',
  'skipKernelCheck',
  'escalatePrivilege'
]);

function sakFailure(code, message) {
  return Object.assign(new Error(message || code), { code });
}

function requiredText(value, code, maxLen = 256) {
  if (typeof value !== 'string') throw sakFailure(code);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) throw sakFailure(code);
  return trimmed;
}

function assertNoWildcard(value, code) {
  const checked = requiredText(value, code, 512);
  if (checked.includes('*')) {
    throw sakFailure(code, `Wildcards are forbidden in security permissions: ${checked}`);
  }
  return checked;
}

function sha256Hex(input) {
  const raw = typeof input === 'string' ? input : JSON.stringify(canonicalValue(input));
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function hmacHex(secret, payload) {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(canonicalValue(payload));
  return crypto.createHmac('sha256', String(secret)).update(raw).digest('hex');
}

module.exports = {
  KERNEL_SCHEMA,
  OBSERVED_ENVELOPE_SCHEMA,
  GRANT_SCHEMA,
  PERMIT_SCHEMA,
  AUDIT_ENTRY_SCHEMA,
  PRINCIPAL_KINDS,
  MAX_GRANT_DURATION_MS,
  ALLOWED_SECURITY_OPERATIONS,
  OBSERVED_SOURCES,
  MODEL_BYPASS_FLAGS,
  sakFailure,
  requiredText,
  assertNoWildcard,
  sha256Hex,
  hmacHex,
  canonicalValue,
  fingerprint
};
