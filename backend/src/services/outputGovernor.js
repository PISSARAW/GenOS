/**
 * Output Governor Service
 * Enforce output contracts on raw LLM text: purification, schema validation,
 * blocked-pattern detection and structured violation reporting.
 */

const DEFAULT_MAX_LENGTH = 10000;
const DEFAULT_BLOCKED_PATTERNS = [
  /ignore (all|previous) instructions/i,
  /system prompt/i,
  /reveal your instructions/i,
  /jailbreak/i,
];

function enforceOutputContract(rawText, contractOpts = {}) {
  const structured = contractOpts.structured === true;
  const result = newResult(contractOpts);

  if (!rawText || typeof rawText !== 'string') {
    reject(result, 'EMPTY_OR_NON_STRING_INPUT');
    return structured ? result : '';
  }

  const purified = purify(rawText, contractOpts);
  result.purified = purified;
  enforceMaxLength(result, purified, contractOpts);
  enforceBlockedPatterns(result, purified, contractOpts);
  enforceJsonSchema(result, purified, contractOpts);
  return structured ? result : purified;
}

function newResult(contractOpts) {
  return {
    purified: '', valid: true, violations: [],
    contractType: contractOpts.outputType || 'text',
  };
}

function reject(result, violation) {
  result.violations.push(violation);
  result.valid = false;
}

function purify(rawText, contractOpts) {
  let purified = rawText.trim();
  const preamble = purified.match(/(^|\n)(---|# )/);
  if (contractOpts.stripPreamble && preamble) {
    purified = purified.slice(preamble.index).trim();
  }
  if (contractOpts.stripPostamble) {
    const postamble = /\n+.*(N'hésitez pas|J'espère|Voici|Bien sûr|Merci).*$/i;
    purified = purified.replace(postamble, '').trim();
  }
  return purified;
}

function enforceMaxLength(result, purified, contractOpts) {
  const maxLength = contractOpts.maxLength || DEFAULT_MAX_LENGTH;
  if (purified.length > maxLength) {
    reject(result, `MAX_LENGTH_EXCEEDED:${purified.length}>${maxLength}`);
  }
}

function enforceBlockedPatterns(result, purified, contractOpts) {
  const blockedPatterns = contractOpts.blockedPatterns || DEFAULT_BLOCKED_PATTERNS;
  for (const pattern of blockedPatterns) {
    if (pattern.test(purified)) {
      reject(result, `BLOCKED_PATTERN:${pattern.source}`);
    }
  }
}

function enforceJsonSchema(result, purified, contractOpts) {
  if (contractOpts.outputType !== 'json' || !contractOpts.schema) {
    return;
  }
  try {
    const errors = validateAgainstSchema(JSON.parse(purified), contractOpts.schema);
    errors.forEach((error) => reject(result, `SCHEMA:${error}`));
  } catch (error) {
    reject(result, 'SCHEMA:INVALID_JSON');
  }
}

function validateAgainstSchema(value, schema) {
  if (!schema || typeof schema !== 'object') {
    return [];
  }
  if (schema.type !== 'object' || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  return [...requiredErrors(value, schema), ...propertyErrors(value, schema)];
}

function requiredErrors(value, schema) {
  const required = Array.isArray(schema.required) ? schema.required : [];
  return required.filter((key) => !(key in value)).map((key) => `missing_required:${key}`);
}

function propertyErrors(value, schema) {
  if (!schema.properties || typeof schema.properties !== 'object') {
    return [];
  }
  const errors = [];
  for (const [key, propertySchema] of Object.entries(schema.properties)) {
    if (key in value) {
      const violations = validateProperty(value[key], propertySchema);
      errors.push(...violations.map((violation) => `${key}:${violation}`));
    }
  }
  return errors;
}

function validateProperty(value, propSchema) {
  if (!propSchema || typeof propSchema !== 'object') {
    return [];
  }
  const validators = {
    string: (candidate) => typeof candidate === 'string',
    number: (candidate) => typeof candidate === 'number',
    boolean: (candidate) => typeof candidate === 'boolean',
    array: (candidate) => Array.isArray(candidate),
  };
  const validator = validators[propSchema.type];
  return validator && !validator(value) ? [`expected_${propSchema.type}`] : [];
}

module.exports = {
  enforceOutputContract,
  DEFAULT_MAX_LENGTH,
  DEFAULT_BLOCKED_PATTERNS,
  validateAgainstSchema,
  validateProperty,
};
