'use strict';

function assessCompatibility(input = {}) {
  const required = normalize(input.requiredCapabilities);
  const available = new Set(normalize(input.capabilities));
  const missing = required.filter((capability) => !available.has(capability));
  const matched = required.length - missing.length;
  return {
    compatible: missing.length === 0,
    matchedCapabilities: matched,
    missingCapabilities: missing,
    fit: required.length ? matched / required.length : 1
  };
}

function normalize(values) {
  return Array.isArray(values) ? [...new Set(values.map((value) => String(value).trim()).filter(Boolean))] : [];
}

module.exports = { assessCompatibility };
