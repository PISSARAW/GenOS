const config = require('../../../config/orchestratorConfig');

function maxWorkers() {
  return config.maxWorkers();
}

module.exports = { maxWorkers };