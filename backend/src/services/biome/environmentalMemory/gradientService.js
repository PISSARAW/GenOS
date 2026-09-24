'use strict';

function gradient(trails = []) {
  return trails.reduce((result, trail) => {
    const weight = Math.max(0, Number(trail.intensity) || 0) * Math.max(0, Number(trail.confidence) || 0);
    result.attractant += weight * (Number(trail.attractant) || 0);
    result.repellent += weight * (Number(trail.repellent) || 0);
    result.expectedYield += weight * (Number(trail.yield) || 0);
    result.risk += weight * (Number(trail.risk) || 0);
    return result;
  }, { attractant: 0, repellent: 0, expectedYield: 0, risk: 0 });
}

module.exports = { gradient };
