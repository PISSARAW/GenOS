const assert = require('node:assert/strict');
const jobWorker = require('../src/services/jobWorker');

const jobs = [
  { id: 'a1', organization_id: 'org-a', project_id: 'project-a' },
  { id: 'a2', organization_id: 'org-a', project_id: 'project-a' },
  { id: 'b1', organization_id: 'org-b', project_id: 'project-b' }
];

const first = jobWorker.selectFairWorkflow(jobs);
const second = jobWorker.selectFairWorkflow(jobs);
assert.equal(first.id, 'a1');
assert.equal(second.id, 'b1');
console.log('Workflow fairness checks passed.');
