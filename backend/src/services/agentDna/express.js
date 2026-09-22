const DEFAULT_TEMP = 0.45;
const DEFAULT_TOP_P = 0.9;
const DEFAULT_STRATEGY = 'tree-search';

// Chromatin states: 0=eucromatin, 1=heterochromatin constitutive, 2=heterochromatin facultative
function isSilenced(gene) {
  if (gene.methylated) return true;
  if (gene.chromatin === 1) return true;
  if (gene.chromatin === 2 && gene.locked) return true;
  if (Number.isFinite(gene.volume) && gene.volume <= 0) return true;
  return false;
}

function parseUnit(value, fallback) {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

function classify(locus, gene, phenotype) {
  const value = gene.instruction;
  if (locus === 'ROLE') phenotype.role = value;
  else if (locus === 'STRATEGY') phenotype.strategy = value;
  else if (locus === 'OBJECTIVE_PRIMARY') phenotype.prompt = value;
  else if (locus === 'MODEL_TEMP') phenotype.temp = parseUnit(value, DEFAULT_TEMP);
  else if (locus === 'MODEL_TOPP') phenotype.topP = parseUnit(value, DEFAULT_TOP_P);
  else if (locus.indexOf('TOOL_') === 0) phenotype.tools.push(value);
  else if (locus.indexOf('CAP_') === 0) phenotype.capabilities.push(value);
}

function express(model) {
  const name = model.meta.name;
  const phenotype = {
    role: '',
    strategy: '',
    tools: [],
    capabilities: [],
    temp: DEFAULT_TEMP,
    topP: DEFAULT_TOP_P,
    prompt: '',
    exprTfs: [],
    exprMirnas: [],
    silenced: [],
    expressed: 0
  };
  for (const locus of Object.keys(model.genes)) {
    const gene = model.genes[locus];
    if (isSilenced(gene)) {
      phenotype.silenced.push(locus);
    } else {
      phenotype.expressed += 1;
      classify(locus, gene, phenotype);
    }
  }
  if (!phenotype.role) phenotype.role = name;
  if (!phenotype.strategy) phenotype.strategy = DEFAULT_STRATEGY;
  if (!phenotype.prompt) phenotype.prompt = `${phenotype.role}: ${name}`;
  phenotype.temp = parseUnit(phenotype.temp, DEFAULT_TEMP);
  phenotype.topP = parseUnit(phenotype.topP, DEFAULT_TOP_P);
  return phenotype;
}

module.exports = { express, isSilenced, DEFAULT_TEMP, DEFAULT_TOP_P, DEFAULT_STRATEGY };
