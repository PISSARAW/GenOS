'use strict';

const { FastControlLoop } = require('./fastControlLoop');
const { StructuralControlLoop, FlapDetector } = require('./structuralControlLoop');
const { EvolutionaryControlLoop } = require('./evolutionaryControlLoop');
const { ControlLoopOrchestrator } = require('./orchestrator');
const { LOOP_ACTIONS, classifyAction, loopIsDue } = require('./morphogenesisControlLoopService');

module.exports = {
  FastControlLoop,
  StructuralControlLoop,
  FlapDetector,
  EvolutionaryControlLoop,
  ControlLoopOrchestrator,
  LOOP_ACTIONS,
  classifyAction,
  loopIsDue
};