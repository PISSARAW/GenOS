const biologicalMode = require('./biologicalModeService');
module.exports = {
  analyzeMission: (mission) => biologicalMode.analyzeMission('biocenose', mission),
  compose: (mission) => biologicalMode.compose('biocenose', mission)
};