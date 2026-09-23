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
  phenotype.tools.sort();
  phenotype.capabilities.sort();
  phenotype.silenced.sort();
  phenotype.exprTfs.sort();
  phenotype.exprMirnas.sort();
}

function cloneGenes(genes) {
  const out = {};
  for (const [locus, gene] of Object.entries(genes || {})) {
    out[locus] = { ...gene };
  }
  return out;
}

function applyDevelopmentVolume(development, genes) {
  if (development && development.stage === 'Senescent') {
    for (const gene of Object.values(genes)) {
      gene.volume = (Number(gene.volume) || 1) * 0.7;
    }
  }
}

function express(model) {
  const name = model.meta.name;
  const phenotype = {
    role: '', strategy: '', tools: [], capabilities: [],
    temp: DEFAULT_TEMP, topP: DEFAULT_TOP_P, prompt: '',
    exprTfs: [], exprMirnas: [], silenced: [], expressed: 0
  };
  const genes = cloneGenes(model.genes);
  if (model.epigenome) applyEpigenomeMarks(model.epigenome, genes);
  applyDevelopmentVolume(model.development, genes);
  const activeTfs = computeActiveTfs(model.grn, genes, model.development);
  const context = { activeTfs, activeMirnas: [] };
  context.activeMirnas = computeActiveMirnas(genes, context);
  const fullContext = { activeTfs, activeMirnas: context.activeMirnas };
  for (const locus of Object.keys(genes)) {
    const gene = genes[locus];
    if (isSilenced(gene, fullContext)) phenotype.silenced.push(locus);
    else {
      phenotype.expressed += 1;
      classify(locus, gene, phenotype);
    }
  }
  phenotype.exprTfs = activeTfs;
  phenotype.exprMirnas = fullContext.activeMirnas;
  finalizePhenotype(phenotype, name);
  return phenotype;
}

module.exports = { express, DEFAULT_TEMP, DEFAULT_TOP_P, DEFAULT_STRATEGY };
