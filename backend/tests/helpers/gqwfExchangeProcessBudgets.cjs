'use strict';

const verifierMs = 10000;
const preparationMs = 30000;
const verificationsPerOperation = 3;
const concurrentCandidates = 2;
const operationMs = preparationMs + verificationsPerOperation * verifierMs;
const requestMs = concurrentCandidates * operationMs;

module.exports = { verifierMs, preparationMs, requestMs };
