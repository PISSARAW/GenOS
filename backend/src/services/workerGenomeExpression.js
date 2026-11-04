'use strict';

const { contentFingerprint } = require('./geneticsConstants');
const { normalizeToolName } = require('./toolLeasePolicy');

function invalidGenome(message) {
  return Object.assign(new Error(message), { code: 'INVALID_WORKER_GENOME' });
}

function names(value, label) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
    throw invalidGenome(`Worker genome ${label} must be an array of non-empty names.`);
  }
  return [...new Set(value.map(item => item.trim()))];
}

function unit(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw invalidGenome(`Worker genome ${label} must be a finite number in [0, 1].`);
  }
  return value;
}

function express(genes) {
  if (!genes || typeof genes !== 'object') throw invalidGenome('Worker genome is required.');
  return {
    role: text(genes.role, 'role'), strategy: text(genes.strategy, 'strategy'),
    tools: names(genes.tools, 'tools'),
    ...(genes.capabilities === undefined ? {} : { capabilities: names(genes.capabilities, 'capabilities') }),
    prompt: typeof genes.prompt === 'string' ? genes.prompt : '',
    temp: unit(genes.temp, 'temp'), topP: unit(genes.topP, 'topP')
  };
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw invalidGenome(`Worker genome ${label} is required.`);
  return value.trim();
}

function restrictTools(genes, lease) {
  const tools = new Set(genes.tools.map(normalizeToolName));
  return (Array.isArray(lease) ? lease : []).filter(tool => tools.has(normalizeToolName(tool)));
}

function promptBlock(genes) {
  return `Inherited genome phenotype: ${JSON.stringify({ role: genes.role, strategy: genes.strategy,
    prompt: genes.prompt, tools: genes.tools })}`;
}

function samplingOptions(mission) {
  if (!mission.genome || !usesCognitiveGenome(mission)) return {};
  const genes = express(mission.genome);
  return { temperature: genes.temp, topP: genes.topP };
}

function apply(mission, genes) {
  const phenotype = express(genes);
  const block = promptBlock(phenotype);
  const prompt = String(mission.prompt || mission.currentTask || '');
  mission.prompt = prompt.includes(block) ? prompt : `${prompt}\n\n${block}`;
  mission.genome = mission.dnaIncarnation ? { ...phenotype, dnaIncarnation: mission.dnaIncarnation } : phenotype;
  mission.toolLease = restrictTools(phenotype, mission.toolLease);
  mission.genomeExpression = { contentHash: contentFingerprint(phenotype), phenotype,
    sampling: 'requested', effectiveTools: [...mission.toolLease] };
  return mission;
}

function authorityBinding(mission) {
  if (!mission.genome || !usesCognitiveGenome(mission)) return {};
  return { genomeExpressionHash: contentFingerprint(express(mission.genome)),
    ...(mission.dnaIncarnation ? { dnaIncarnationHash: contentFingerprint(mission.dnaIncarnation) } : {}) };
}

function assertAuthority(envelope, mission) {
  const binding = authorityBinding(mission);
  if (envelope.genomeExpressionHash === binding.genomeExpressionHash
    && envelope.dnaIncarnationHash === binding.dnaIncarnationHash) return;
  throw Object.assign(new Error('Expressed worker genome changed after execution sealing.'),
    { code: 'EXECUTION_AUTHORITY_CONTEXT_CHANGED' });
}

function usesCognitiveGenome(mission) {
  return !require('./agents/workerRuntimeLimitsService').isDeterministicWorkerMission(mission);
}

function selectionFor(input) {
  if (input.dnaSelection) return input.dnaSelection;
  return usesCognitiveGenome(input.mission) ? input.evolution : null;
}

module.exports = { express, apply, restrictTools, promptBlock, samplingOptions, authorityBinding,
  assertAuthority, usesCognitiveGenome, selectionFor };
