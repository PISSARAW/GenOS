const assert = require('node:assert/strict');
const jobWorker = require('../src/services/jobWorker');

const jobs = [
  { id: 'a1', organization_id: 'org-a', project_id: 'project-a' },
  { id: 'a2', organization_id: 'org-a', project_id: 'project-a' },
  { id: 'b1', organization_id: 'org-b', project_id: 'project-b' }
];

const first = jobWorker.selectFairWorkflow(jobs, 'workflow_runs');
const second = jobWorker.selectFairWorkflow(jobs, 'workflow_runs');
assert.equal(first.id, 'a1');
assert.equal(second.id, 'b1');
const evaluation = jobWorker.selectFairWorkflow([
  { id: 'eval-a', organization_id: 'org-a', project_id: 'project-a' },
  { id: 'eval-b', organization_id: 'org-b', project_id: 'project-b' }
], 'evaluation_jobs');
assert.equal(evaluation.id, 'eval-a', 'evaluation fairness must have its own cursor');
console.log('Workflow fairness checks passed.');
