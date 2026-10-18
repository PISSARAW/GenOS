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

  const result = {
    purified: '',
    valid: true,
    violations: [],
    contractType: contractOpts.outputType || 'text',
  };

  if (!rawText || typeof rawText !== 'string') {
    result.violations.push('EMPTY_OR_NON_STRING_INPUT');
    result.valid = false;
    return structured ? result : '';
  }

  let purified = rawText.trim();

  // 1. Purification (préambule / postambule)
  if (contractOpts.stripPreamble) {
    const match = purified.match(/(^|\n)(---|# )/);
    if (match) {
      purified = purified.slice(match.index).trim();
    }
  }

  if (contractOpts.stripPostamble) {
    const postambleRegex = /\n+.*(N'hésitez pas|J'espère|Voici|Bien sûr|Merci).*$/i;
    purified = purified.replace(postambleRegex, '').trim();
  }

  result.purified = purified;

  // 2. Longueur maximale
  const maxLength = contractOpts.maxLength || DEFAULT_MAX_LENGTH;
  if (purified.length > maxLength) {
    result.violations.push(`MAX_LENGTH_EXCEEDED:${purified.length}>${maxLength}`);
    result.valid = false;
  }

  // 3. Patterns bloqués
  const blockedPatterns = contractOpts.blockedPatterns || DEFAULT_BLOCKED_PATTERNS;
  for (const pattern of blockedPatterns) {
    if (pattern.test(purified)) {
      result.violations.push(`BLOCKED_PATTERN:${pattern.source}`);
      result.valid = false;
    }
  }

  // 4. Validation de schéma JSON si demandé
  if (contractOpts.outputType === 'json' && contractOpts.schema) {
    try {
      const parsed = JSON.parse(purified);
      const schemaErrors = validateAgainstSchema(parsed, contractOpts.schema);
      if (schemaErrors.length > 0) {
        result.violations.push(...schemaErrors.map((e) => `SCHEMA:${e}`));
        result.valid = false;
      }
    } catch (error) {
      result.violations.push('SCHEMA:INVALID_JSON');
      result.valid = false;
    }
  }

  return structured ? result : purified;
}

function validateAgainstSchema(value, schema) {
  const errors = [];
  if (!schema || typeof schema !== 'object') {
    return errors;
  }

  if (schema.type === 'object' && typeof value === 'object' && !Array.isArray(value)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in value)) {
          errors.push(`missing_required:${key}`);
        }
      }
    }
    if (schema.properties && typeof schema.properties === 'object') {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in value) {
          const propErrors = validateProperty(value[key], propSchema);
          errors.push(...propErrors.map((e) => `${key}:${e}`));
        }
      }
    }
  }

  return errors;
}

function validateProperty(value, propSchema) {
  const errors = [];
  if (!propSchema || typeof propSchema !== 'object') {
    return errors;
  }

  if (propSchema.type === 'string' && typeof value !== 'string') {
    errors.push('expected_string');
  }
  if (propSchema.type === 'number' && typeof value !== 'number') {
    errors.push('expected_number');
  }
  if (propSchema.type === 'boolean' && typeof value !== 'boolean') {
    errors.push('expected_boolean');
  }
  if (propSchema.type === 'array' && !Array.isArray(value)) {
    errors.push('expected_array');
  }

  return errors;
}

module.exports = {
  enforceOutputContract,
  DEFAULT_MAX_LENGTH,
  DEFAULT_BLOCKED_PATTERNS,
  validateAgainstSchema,
  validateProperty,
};
