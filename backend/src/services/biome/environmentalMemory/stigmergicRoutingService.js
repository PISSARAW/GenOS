'use strict';

const gradientService = require('./gradientService');

function rankLocations(locations = []) {
  return locations.map((location) => {
    const gradient = gradientService.gradient(location.trails || []);
    const score = gradient.attractant + gradient.expectedYield - gradient.repellent - gradient.risk;
    return { location: location.location, score, gradient };
  }).sort((left, right) => right.score - left.score || String(left.location).localeCompare(String(right.location)));
}

module.exports = { rankLocations };
