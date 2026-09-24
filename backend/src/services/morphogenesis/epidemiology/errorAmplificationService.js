'use strict';

function errorAmplification(sourceErrors, contaminatedDecisions) {
  const sources = Math.max(0, Number(sourceErrors) || 0);
  const contaminated = Math.max(0, Number(contaminatedDecisions) || 0);
  return { ratio: sources === 0 ? 0 : contaminated / sources, sourceErrors: sources, contaminatedDecisions: contaminated };
}

module.exports = { errorAmplification };
