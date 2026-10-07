'use strict';

const values = require('../trinityProvenanceValues');
const STATEMENT = 'Le code enregistré satisfait les 264 cas du contrat euclidean_modulo_v1.';
const DOMAIN = { statement: 'Expressions arithmétiques bornées du langage genos.integer-expression/v1.',
  constraints: ['a est entier de -16 à 16 et b est entier de 1 à 8.',
    'Le résultat est le reste euclidien dans [0,b[ pour chacun des 264 couples.',
    'La conformité hors de ce domaine et la qualité générale du projet ne sont pas évaluées.'] };
const CONTRACT = { schema: 'genos.code-postcondition-contract/v1', id: 'euclidean_modulo_v1', version: 1,
  language: 'genos.integer-expression/v1', minimumA: -16, maximumA: 16,
  minimumB: 1, maximumB: 8, cases: 264, rule: 'integer remainder r with a=q*b+r and 0<=r<b' };

function descriptor() { return values.clone(CONTRACT); }
function hash() { return values.digest(CONTRACT); }

function assertInput(method) {
  const input = require('../agents/workerNativeEvidence').methodInput(method, 'verify_code_postconditions');
  if (Object.keys(input).some(key => !['artifactPath', 'expectedContentHash', 'contractId'].includes(key))) throw values.failure('CODE_ORACLE_INPUT_INVALID');
  if (input.contractId !== CONTRACT.id) throw values.failure('CODE_ORACLE_CONTRACT_UNAVAILABLE');
  values.requireHash(input.expectedContentHash);
  const relative = require('../pathSafety').normalizeRelativePath(input.artifactPath);
  if (relative.length > 240 || !/^src\/[A-Za-z0-9._/-]+\.gexpr$/.test(relative)) throw values.failure('CODE_ORACLE_PATH_INVALID');
  return relative;
}

function cases() {
  const result = [];
  for (let a = CONTRACT.minimumA; a <= CONTRACT.maximumA; a += 1) {
    for (let b = CONTRACT.minimumB; b <= CONTRACT.maximumB; b += 1) result.push({ a, b });
  }
  return result;
}

module.exports = { STATEMENT, DOMAIN, descriptor, hash, assertInput, cases };
