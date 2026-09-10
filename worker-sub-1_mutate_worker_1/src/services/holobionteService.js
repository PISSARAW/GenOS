const biologicalMode = require('./biologicalModeService');
module.exports = {
  analyzeMission: (mission) => biologicalMode.analyzeMission('holobionte', mission),
  compose: (mission) => biologicalMode.compose('holobionte', mission)
};