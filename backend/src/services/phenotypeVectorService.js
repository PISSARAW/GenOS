'use strict';

const VECTOR_SCHEMA = 'genos.phenotype.v2';
const VECTOR_LENGTH = 7;

function category(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function finiteUnit(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function phenotypeVector(phenotype, state = {}) {
  const pheno = phenotype || {};
  const branches = (state.branches || []).filter((branch) => branch.active !== false);
  const values = [
    finiteUnit(pheno.temp), finiteUnit(pheno.topP),
    finiteUnit(Number(pheno.expressed || 0) / 32),
    finiteUnit(branches.length / 16),
    finiteUnit(branches.length ? branches.reduce((sum, branch) => sum + finiteUnit(branch.strength), 0) / branches.length : 0),
    finiteUnit((pheno.tools || []).length / 16),
    finiteUnit((pheno.capabilities || []).length / 16),
  ];
  return { schema: VECTOR_SCHEMA, values, categories: {
    role: category(pheno.role), strategy: category(pheno.strategy),
  } };
}

function isCompatible(vector) {
  return vector?.schema === VECTOR_SCHEMA && Array.isArray(vector.values)
    && vector.values.length === VECTOR_LENGTH
    && vector.values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    && typeof vector.categories?.role === 'string'
    && typeof vector.categories?.strategy === 'string';
}

function cosineSimilarity(left, right) {
  if (!isCompatible(left) || !isCompatible(right)) throw new Error('Compatible phenotype vectors are required.');
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < VECTOR_LENGTH; index += 1) {
    dot += left.values[index] * right.values[index];
    leftNorm += left.values[index] ** 2;
    rightNorm += right.values[index] ** 2;
  }
  dot += categoryDot(left.categories, right.categories);
  leftNorm += categoryNorm(left.categories);
  rightNorm += categoryNorm(right.categories);
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
}

function categoryDot(left, right) {
  let matches = 0;
  for (const key of ['role', 'strategy']) {
    matches += Number(Boolean(left[key]) && left[key] === right[key]);
  }
  return matches;
}

function categoryNorm(categories) {
  return Number(Boolean(categories.role)) + Number(Boolean(categories.strategy));
}

module.exports = { VECTOR_SCHEMA, phenotypeVector, cosineSimilarity };
