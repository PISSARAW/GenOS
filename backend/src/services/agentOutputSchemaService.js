const fs = require('fs');
const path = require('path');

let cachedSchema = null;

function loadSchema() {
  if (cachedSchema) return cachedSchema;
  const schemaPath = path.resolve(__dirname, '../../bin/agent-output-schema.json');
  const raw = fs.readFileSync(schemaPath, 'utf8');
  cachedSchema = JSON.parse(raw);
  return cachedSchema;
}

function getSchema() {
  return loadSchema();
}

function describeType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function enumValues(hint) {
  return hint.split('|').map((s) => s.trim()).filter(Boolean);
}

function isEnumHint(schemaValue) {
  return typeof schemaValue === 'string' && schemaValue.includes('|');
}

function validateNodeArray(value, path_, itemSchema) {
  if (!Array.isArray(value)) return [`${path_}: expected array, got ${describeType(value)}`];
  if (value.length === 0) return [];
  if (typeof itemSchema === 'string') return [];
  const violations = [];
  for (let i = 0; i < value.length; i++) {
    violations.push(...validateNode(value[i], itemSchema, `${path_}[${i}]`));
  }
  return violations;
}

function validateNodeObject(value, schemaNode, path_) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [`${path_}: expected object, got ${describeType(value)}`];
  }
  const violations = [];
  for (const key of Object.keys(value)) {
    if (schemaNode[key] !== undefined) {
      violations.push(...validateNode(value[key], schemaNode[key], `${path_}.${key}`));
    }
  }
  return violations;
}

function validateNodeEnum(value, schemaNode, path_) {
  const allowed = enumValues(schemaNode);
  if (!allowed.includes(String(value))) {
    return [`${path_}: expected one of [${allowed.join(', ')}], got "${value}"`];
  }
  return [];
}

function validateNodePrimitive(value, schemaNode, path_) {
  if (schemaNode === 'string' && typeof value !== 'string') {
    return [`${path_}: expected string, got ${describeType(value)}`];
  }
  return [];
}

function validateNode(value, schemaNode, path_) {
  if (schemaNode == null) return [];
  if (Array.isArray(schemaNode)) {
    return validateNodeArray(value, path_, schemaNode[0]);
  }
  if (typeof schemaNode === 'object') {
    return validateNodeObject(value, schemaNode, path_);
  }
  if (isEnumHint(schemaNode)) {
    return validateNodeEnum(value, schemaNode, path_);
  }
  return validateNodePrimitive(value, schemaNode, path_);
}

function validateOutput(output) {
  const schema = loadSchema();
  const violations = [];
  if (typeof output !== 'object' || output === null || Array.isArray(output)) {
    return ['expected object, got ' + describeType(output)];
  }
  for (const key of Object.keys(schema)) {
    if (output[key] === undefined) violations.push(`missing required field: ${key}`);
  }
  violations.push(...validateNode(output, schema, 'root'));
  return violations;
}

function findMatchingBrace(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function extractJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1]); } catch (_) {}
  }
  const firstBrace = trimmed.indexOf('{');
  if (firstBrace < 0) return null;
  const last = findMatchingBrace(trimmed, firstBrace);
  if (last < 0) return null;
  try { return JSON.parse(trimmed.slice(firstBrace, last + 1)); } catch (_) { return null; }
}

function parseAndValidate(rawText) {
  const parsed = extractJson(rawText);
  if (parsed === null) return { ok: false, error: 'JSON_PARSE_FAILURE', violations: ['no JSON object found in response'] };
  const violations = validateOutput(parsed);
  if (violations.length === 0) return { ok: true, output: parsed };
  return { ok: false, error: 'OUTPUT_SCHEMA_VIOLATION', violations };
}

function repairArrayField(repaired, key, defaultValue) {
  if (!Array.isArray(repaired[key])) repaired[key] = defaultValue;
}

function repairStringField(repaired, key) {
  if (typeof repaired[key] !== 'string') {
    repaired[key] = Array.isArray(repaired[key]) ? repaired[key].join(' ') : String(repaired[key] || '');
  }
}

function repairObjectField(repaired, key) {
  if (typeof repaired[key] !== 'object' || repaired[key] === null || Array.isArray(repaired[key])) {
    repaired[key] = {};
  }
}

function repairOutcomeField(repaired) {
  const outcome = repaired.outcome;
  if (typeof outcome === 'string') {
    const cleaned = outcome.trim().toLowerCase();
    if (!['success', 'failed', 'no_answer'].includes(cleaned)) repaired.outcome = 'failed';
  } else if (outcome == null) {
    repaired.outcome = 'failed';
  }
}

function repairCreativeEvaluation(repaired) {
  repairObjectField(repaired, 'creativeEvaluation');
  const ce = repaired.creativeEvaluation;
  if (typeof ce.rubric !== 'object' || ce.rubric === null) ce.rubric = {};
  repairArrayField(ce, 'revisions', []);
  repairArrayField(ce, 'criticEvidence', []);
  if (typeof ce.constraintCoverage !== 'number') ce.constraintCoverage = Number(ce.constraintCoverage) || 0;
}

const repairRules = [
  (r) => repairOutcomeField(r),
  (r) => repairArrayField(r, 'uncertainties', []),
  (r) => repairArrayField(r, 'tests', []),
  (r) => repairArrayField(r, 'claims', []),
  (r) => repairArrayField(r, 'dossierInfluence', []),
  (r) => repairStringField(r, 'artifact'),
  (r) => repairStringField(r, 'artifactText'),
  (r) => repairCreativeEvaluation(r),
  (r) => repairObjectField(r, 'failure'),
  (r) => repairObjectField(r, 'noAnswerProof'),
];

function repairOutput(output) {
  const schema = loadSchema();
  const repaired = { ...output };
  for (const key of Object.keys(schema)) {
    if (repaired[key] === undefined) {
      const hint = schema[key];
      if (Array.isArray(hint)) repaired[key] = [];
      else if (typeof hint === 'object' && hint !== null) repaired[key] = {};
      else repaired[key] = '';
    }
  }
  for (const rule of repairRules) {
    rule(repaired);
  }
  return repaired;
}

module.exports = {
  validateOutput,
  parseAndValidate,
  repairOutput,
  getSchema,
};
