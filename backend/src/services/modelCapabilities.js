const ALIASES = new Map([
  ['tool_calling', 'tools'],
  ['tool-calling', 'tools'],
  ['json_formatting', 'json'],
  ['json-formatting', 'json'],
  ['long_context', 'long-context'],
  ['long context', 'long-context'],
  ['code', 'coding']
]);

function normalizeCapability(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  const negative = raw.startsWith('not:');
  const name = negative ? raw.slice(4).trim() : raw;
  const normalized = ALIASES.get(name) || name;
  return normalized ? `${negative ? 'not:' : ''}${normalized}` : null;
}

function normalizeCapabilities(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(normalizeCapability).filter(Boolean))];
}

function capabilitiesSatisfy(values, required) {
  const available = new Set(normalizeCapabilities(values));
  return normalizeCapabilities(required).every((capability) => !available.has(`not:${capability}`) && available.has(capability));
}

module.exports = { normalizeCapability, normalizeCapabilities, capabilitiesSatisfy };
