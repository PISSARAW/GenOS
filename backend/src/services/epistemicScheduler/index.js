'use strict';

const { ActiveTaskRegistry } = require('./activeTaskRegistry');
const { canonicalTask, taskFingerprint } = require('./taskFingerprint');
const independence = require('./independencePolicy');
const novelty = require('./noveltyAllocator');
const { DependencyIndex } = require('./dependencyIndex');
const counterexamples = require('./counterexamplePropagation');
const budgets = require('./budgetReallocator');
const mathematicalGraph = require('./mathematicalDependencyGraph');
const leanGate = require('./leanIncrementalGate');
const leanExecutor = require('./leanProcessExecutor');

module.exports = {
  ActiveTaskRegistry, DependencyIndex, canonicalTask, taskFingerprint,
  ...independence, ...novelty, ...counterexamples, ...budgets, ...mathematicalGraph,
  ...leanGate, ...leanExecutor,
};
