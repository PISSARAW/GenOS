const DEFAULT_TEMP = 0.45;
const DEFAULT_TOP_P = 0.9;
const DEFAULT_STRATEGY = 'tree-search';

const { isSilenced } = require('./silencing');
const { applyEpigenomeMarks } = require('./epigenome');
const { computeActiveTfs, computeActiveMirnas } = require('./grn');
const { classify, parseUnit } = require('./classify');

function finalizePhenotype(phenotype, name) {
  if (!phenotype.role) phenotype.role = name;
  if (!phenotype.strategy) phenotype.strategy = DEFAULT_STRATEGY;
  if (!phenotype.prompt) phenotype.prompt = `${phenotype.role}: ${name}`;
  phenotype.temp = parseUnit(phenotype.temp, DEFAULT_TEMP);
  phenotype.topP = parseUnit(phenotype.topP, DEFAULT_TOP_P);
}

function express(model) {
  const name = model.meta.name;
  const phenotype = {
    role: '', strategy: '', tools: [], capabilities: [],
    temp: DEFAULT_TEMP, topP: DEFAULT_TOP_P, prompt: '',
    exprTfs: [], exprMirnas: [], silenced: [], expressed: 0
  };
  const genes = {};
  for (const [locus, gene] of Object.entries(model.genes || {})) {
    genes[locus] = { ...gene };
  }
  if (model.epigenome) applyEpigenomeMarks(model.epigenome, genes);
  const activeTfs = computeActiveTfs(model.grn, genes);
  const context = { activeTfs, activeMirnas: computeActiveMirnas(genes, { activeTfs, activeMirnas: [] }) };
  for (const locus of Object.keys(genes)) {
    const gene = genes[locus];
    if (isSilenced(gene, context)) phenotype.silenced.push(locus);
    else {
      phenotype.expressed += 1;
      classify(locus, gene, phenotype);
      if (gene.activated) phenotype.exprTfs.push(locus);
    }
  }
  finalizePhenotype(phenotype, name);
  return phenotype;
}

module.exports = { express, DEFAULT_TEMP, DEFAULT_TOP_P, DEFAULT_STRATEGY };
