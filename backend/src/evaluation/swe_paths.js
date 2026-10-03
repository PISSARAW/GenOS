const path = require('path');

const DATA_DIR = path.resolve(process.env.GENOS_SWE_BENCH_DIR || path.resolve(__dirname, '../../../../SWE-bench'));
const REPOS_DIR = path.resolve(process.env.GENOS_SWE_REPOS_DIR || path.resolve(__dirname, '../../../../.genos-agent-worlds/swe_repos'));

module.exports = {
  TASKS_PATH: path.join(DATA_DIR, 'swe_bench_lite_tasks.json'),
  REPOS_DIR
};
