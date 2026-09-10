const biologicalMode = require('./biologicalModeService');
module.exports = {
  analyzeMission: (mission) => biologicalMode.analyzeMission('syncytium', mission),
  compose: (mission) => biologicalMode.compose('syncytium', mission)
};