'use strict';

function clampNumber(input, lower, upper) {
  const value = Number(input);
  if (!Number.isFinite(value)) return lower;
  if (value < lower) return lower;
  if (value > upper) return upper;
  return value;
}

function clamp01(input) {
  return clampNumber(input, 0, 1);
}

function safeInput(input) {
  if (input === undefined) return {};
  if (input === null) return {};
  if (typeof input !== 'object') return {};
  return input;
}

function arrayField(source, key) {
  const value = source[key];
  if (Array.isArray(value)) return value.slice();
  return [];
}

function objectField(source, key) {
  const value = source[key];
  if (value === undefined) return {};
  if (value === null) return {};
  if (typeof value !== 'object') return {};
  return value;
}

function numberField(source, key) {
  return clamp01(source[key]);
}

function snapshot(input) {
  const source = safeInput(input);
  return {
    members: arrayField(source, 'members'),
    sharedState: objectField(source, 'sharedState'),
    signalingState: objectField(source, 'signalingState'),
    gradients: arrayField(source, 'gradients'),
    pheromoneFields: arrayField(source, 'pheromoneFields'),
    quorumState: objectField(source, 'quorumState'),
    synchronization: numberField(source, 'synchronization'),
    informationFlow: objectField(source, 'informationFlow'),
    resourceFlow: objectField(source, 'resourceFlow'),
    roleDistribution: objectField(source, 'roleDistribution'),
    collectiveStress: numberField(source, 'collectiveStress'),
    diversity: numberField(source, 'diversity'),
    coherence: numberField(source, 'coherence'),
    independence: numberField(source, 'independence'),
    redundancy: numberField(source, 'redundancy'),
    congestion: numberField(source, 'congestion')
  };
}

function uniqueRatio(values) {
  if (Array.isArray(values) === false) return 1;
  if (values.length === 0) return 1;
  const mapped = values.map(stringifyValue);
  return new Set(mapped).size / values.length;
}

function stringifyValue(value) {
  return String(value);
}

function memberModels(members) {
  return members.map(pickModel);
}

function pickModel(member) {
  return safeInput(member).model;
}

function memberRecipes(members) {
  return members.map(pickRecipe);
}

function pickRecipe(member) {
  return safeInput(member).recipe;
}

function isMonoculture(count, modelDiv, recipeDiv) {
  if (count < 3) return false;
  if (modelDiv >= 0.4) return false;
  if (recipeDiv >= 0.4) return false;
  return true;
}

function detectMonoculture(input) {
  const source = safeInput(input);
  const members = arrayField(source, 'members');
  const modelDiversity = uniqueRatio(memberModels(members));
  const recipeDiversity = uniqueRatio(memberRecipes(members));
  return {
    monoculture: isMonoculture(members.length, modelDiversity, recipeDiversity),
    modelDiversity: clamp01(modelDiversity),
    recipeDiversity: clamp01(recipeDiversity)
  };
}

function collectIssues(phys, mono) {
  const issues = [];
  appendHigh({ issues, value: phys.congestion, limit: 0.7, label: 'communication_saturation' });
  appendHigh({ issues, value: phys.redundancy, limit: 0.7, label: 'duplicate_work' });
  appendConvergence(issues, phys);
  appendMono(issues, mono);
  appendHigh({ issues, value: phys.collectiveStress, limit: 0.75, label: 'collective_stress' });
  return issues;
}

function appendHigh(input) {
  if (input.value > input.limit) input.issues.push(input.label);
}

function appendConvergence(issues, phys) {
  if (phys.coherence > 0.9) pushIfIsolated(issues, phys);
}

function pushIfIsolated(issues, phys) {
  if (phys.independence < 0.2) issues.push('premature_convergence');
}

function appendMono(issues, mono) {
  if (mono.monoculture === true) issues.push('cognitive_monoculture');
}

function homeostasis(input) {
  const phys = snapshot(safeInput(input));
  const mono = detectMonoculture({ members: phys.members });
  const issues = collectIssues(phys, mono);
  return { stable: issues.length === 0, issues, monoculture: mono };
}

function voteWeight(vote) {
  const source = safeInput(vote);
  return clamp01(source.competence) * clamp01(source.independence) * clamp01(source.calibration);
}

function voteYesWeight(vote) {
  if (safeInput(vote).choice === 'yes') return voteWeight(vote);
  return 0;
}

function sumWeights(votes, picker) {
  return votes.map(picker).reduce(addNumbers, 0);
}

function addNumbers(left, right) {
  return left + right;
}

function quorumRatio(yes, total) {
  if (total > 0) return yes / total;
  return 0;
}

function adaptiveQuorum(input) {
  const source = safeInput(input);
  const votes = arrayField(source, 'votes');
  const weightedTotal = sumWeights(votes, voteWeight);
  const weightedYes = sumWeights(votes, voteYesWeight);
  const ratio = quorumRatio(weightedYes, weightedTotal);
  return { ratio: clamp01(ratio), accepted: ratio > 0.6, weightedTotal, quorum: 'competence-weighted, not truth' };
}

module.exports = {
  snapshot,
  detectMonoculture,
  homeostasis,
  adaptiveQuorum
};
