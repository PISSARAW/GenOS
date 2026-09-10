const biologicalMode = require('./biologicalModeService');
module.exports = {
  analyzeMission: (mission) => biologicalMode.analyzeMission('biome', mission),
  compose: (mission) => biologicalMode.compose('biome', mission)
};