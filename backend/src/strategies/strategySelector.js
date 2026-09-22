'use strict';

/**
 * @file strategySelector.js
 * @description Main entry point for strategy selection
 */

const { classifyProblem, profileProblem } = require('./strategySelectorHelpers');
const { selectStrategyPortfolio } = require('./strategySelectorDecisions');

module.exports = { classifyProblem, profileProblem, selectStrategyPortfolio };