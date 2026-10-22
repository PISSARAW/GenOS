'use strict';

const {
  OBSERVED_ENVELOPE_SCHEMA,
  OBSERVED_SOURCES,
  sakFailure,
  requiredText,
  sha256Hex,
  fingerprint
} = require('./sakPrimitives');

const INJECTION_RULES = Object.freeze([
  { id: 'prompt_override', pattern: /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions/i },
  { id: 'system_directive', pattern: /(?:^|\s)(?:system|developer|operator_override|admin_override)\s*:/i },
  { id: 'instruction_tag', pattern: /\[(?:INST|SYSTEM|ADMIN|EXECUTE|TOOL_CALL)\]/i },
  { id: 'directive_phrase', pattern: /(?:nouvelle\s+instruction|new\s+instruction|execute\s+immediately|ex[eé]cuter\s+imm[eé]diatement)/i },
  { id: 'permission_spoof', pattern: /(?:grant_permission|issue_grant|bypass_auth|disable_firewall|remove_firewall_rule\s*\()/i },
  { id: 'shell_injection', pattern: /(?:;\s*rm\s+-rf|powershell(?:\.exe)?\s+-enc|cmd\.exe\s+\/c|curl\s+https?:\/\/[^\s]+\s*\|\s*(?:sh|bash))/i }
]);

function serializeObservedContent(rawContent) {
  if (typeof rawContent === 'string') return rawContent;
  return JSON.stringify(rawContent ?? '');
}

function detectLogOrReportInjection(rawContent) {
  const text = serializeObservedContent(rawContent);
  const matchedRules = INJECTION_RULES
    .filter((rule) => rule.pattern.test(text))
    .map((rule) => rule.id);
  return {
    injectionDetected: matchedRules.length > 0,
    matchedRules,
    contentHash: sha256Hex(text)
  };
}

function sanitizeObservedText(rawText) {
  let cleaned = String(rawText ?? '');
  for (const rule of INJECTION_RULES) {
    cleaned = cleaned.replace(new RegExp(rule.pattern.source, 'gi'), '[REDACTED_INJECTION_PATTERN]');
  }
  return cleaned;
}

function ingestObservedData(rawContent, metadata = {}) {
  const sourceFormat = requiredText(metadata.sourceFormat || 'evtx', 'SAK_OBSERVED_SOURCE_REQUIRED', 64).toLowerCase();
  const originRef = requiredText(metadata.originRef || 'evtx://event-record', 'SAK_OBSERVED_ORIGIN_REQUIRED', 512);
  const serialized = serializeObservedContent(rawContent);
  const scan = detectLogOrReportInjection(serialized);
  const body = {
    schema: OBSERVED_ENVELOPE_SCHEMA,
    channel: 'observed_data',
    sourceFormat,
    originRef,
    executable: false,
    canIssueInstructions: false,
    authority: 'none',
    injectionDetected: scan.injectionDetected,
    matchedInjectionRules: scan.matchedRules,
    rawContentHash: scan.contentHash,
    sanitizedPreview: sanitizeObservedText(serialized).slice(0, 512)
  };
  return Object.freeze({ ...body, envelopeHash: fingerprint(body) });
}

function isObservedDataObject(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  return [
    candidate.schema === OBSERVED_ENVELOPE_SCHEMA,
    candidate.channel === 'observed_data',
    candidate.executable === false,
    OBSERVED_SOURCES.includes(String(candidate.sourceFormat || '').toLowerCase()),
    OBSERVED_SOURCES.includes(String(candidate.sourceChannel || '').toLowerCase()),
    OBSERVED_SOURCES.includes(String(candidate.instructionSource || '').toLowerCase())
  ].some(Boolean);
}

function assertInstructionSeparation(request) {
  if (!request || typeof request !== 'object') {
    throw sakFailure('SAK_REQUEST_INVALID', 'Authorization request must be an object.');
  }
  if (isObservedDataObject(request) || isObservedDataObject(request.instruction)) {
    throw sakFailure(
      'SAK_OBSERVED_DATA_NOT_EXECUTABLE',
      'Observed data from EVTX logs or audit reports can never be interpreted as an executable instruction.'
    );
  }
  if (request.derivedFromObservedData === true || request.evtxAssertionAsInstruction === true) {
    throw sakFailure(
      'SAK_OBSERVED_DATA_NOT_EXECUTABLE',
      'An assertion inside an EVTX file or audit report cannot act as an instruction.'
    );
  }
  const textToScan = [
    request.reason,
    request.rationale,
    request.command,
    request.rawLogExcerpt,
    request.reportExcerpt,
    request.parameters
  ];
  const scan = detectLogOrReportInjection(textToScan);
  if (scan.injectionDetected) {
    throw sakFailure(
      'SAK_LOG_INJECTION_BLOCKED',
      `Instruction injection detected in request context: ${scan.matchedRules.join(', ')}`
    );
  }
  return true;
}

module.exports = {
  INJECTION_RULES,
  detectLogOrReportInjection,
  sanitizeObservedText,
  ingestObservedData,
  isObservedDataObject,
  assertInstructionSeparation
};
