const path = require('path');

const DATA_DIR = path.resolve(process.env.GENOS_SWE_BENCH_DIR || path.resolve(__dirname, '../../../../SWE-bench'));
const REPOS_DIR = path.resolve(process.env.GENOS_SWE_REPOS_DIR || path.resolve(__dirname, '../../../../.genos-agent-worlds/swe_repos'));

function validateRepoName(repoName) {
  if (typeof repoName !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoName)) {
    throw new Error('SWE repository must be an owner/repository name.');
  }
  return repoName;
}

function validateBaseCommit(commit) {
  if (typeof commit !== 'string' || !/^[a-f0-9]{7,64}$/i.test(commit)) {
    throw new Error('SWE base commit must be a hexadecimal Git object id.');
  }
  return commit;
}

module.exports = {
  TASKS_PATH: path.join(DATA_DIR, 'swe_bench_lite_tasks.json'),
  REPOS_DIR,
  validateRepoName,
  validateBaseCommit
};
