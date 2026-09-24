'use strict';

function measureInterfaceComplexity(input = {}) {
  const interfaces = Math.max(0, Number(input.interfaceCount) || 0);
  const domains = Math.max(0, Number(input.domainCount) || 0);
  const changes = Math.max(0, Number(input.changeRate) || 0);
  const score = clamp((interfaces * Math.max(1, domains - 1) + changes) / Math.max(1, domains * 4), 0, 1);
  return { score, interfaceCount: interfaces, domainCount: domains, changeRate: changes };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

module.exports = { measureInterfaceComplexity, clamp };
