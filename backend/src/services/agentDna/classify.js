const DEFAULT_TEMP = 0.45;

const LOCUS_CLASSIFIERS = {
  'ROLE': 'role',
  'STRATEGY': 'strategy',
  'OBJECTIVE_PRIMARY': 'prompt',
  'MODEL_TEMP': 'temp',
  'MODEL_TOPP': 'topP'
};

function parseUnit(value, fallback) {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

function classify(locus, gene, phenotype) {
  const value = gene.instruction;
  const field = LOCUS_CLASSIFIERS[locus];
  if (field) {
    phenotype[field] = (field === 'temp' || field === 'topP') ? parseUnit(value, DEFAULT_TEMP) : value;
    return;
  }
  if (locus.indexOf('TOOL_') === 0) phenotype.tools.push(value);
  else if (locus.indexOf('CAP_') === 0) phenotype.capabilities.push(value);
}

module.exports = { classify, parseUnit, DEFAULT_TEMP };
