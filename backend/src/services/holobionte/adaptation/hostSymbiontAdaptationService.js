'use strict';

const compatibility = require('./compatibilityLearningService');

async function learnBidirectionalAdaptation(db, input = {}) {
  const learning = await compatibility.recordCompatibility(db, input);
  if (learning.accepted === false) return { learned: false, learning };
  return {
    learned: true,
    learning,
    hostLearning: {
      whenToCall: learning.observation.capability,
      requiredContext: learning.observation.requiredInputs,
      evidenceProduced: learning.observation.evidenceProduced
    },
    symbiontLearning: {
      hostOntology: learning.observation.hostOntology,
      hostConventions: learning.observation.hostConventions,
      hostErrorPatterns: learning.observation.errorPatterns,
      preferredOutputShape: learning.observation.preferredOutputShape
    }
  };
}

module.exports = { learnBidirectionalAdaptation };
