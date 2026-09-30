'use strict';

const VECTOR_SCHEMA = 'genos.phenotype.v1';
const CATEGORY_BUCKETS = 8;
const VECTOR_LENGTH = 7 + CATEGORY_BUCKETS * 2;

function categoryBucket(value, offset) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return -1;
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return offset + ((hash >>> 0) % CATEGORY_BUCKETS);
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
    ...Array(CATEGORY_BUCKETS * 2).fill(0),
  ];
  const role = categoryBucket(pheno.role, 7);
  const strategy = categoryBucket(pheno.strategy, 7 + CATEGORY_BUCKETS);
  if (role >= 0) values[role] = 1;
  if (strategy >= 0) values[strategy] = 1;
  return { schema: VECTOR_SCHEMA, values };
}

function isCompatible(vector) {
  return vector?.schema === VECTOR_SCHEMA && Array.isArray(vector.values) && vector.values.length === VECTOR_LENGTH;
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
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
}

module.exports = { VECTOR_SCHEMA, phenotypeVector, cosineSimilarity };
