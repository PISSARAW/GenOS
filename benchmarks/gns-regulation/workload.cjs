'use strict';

const { createHash } = require('node:crypto');

function jobs(seed) {
  let value = seed;
  return Array.from({ length: 12 }, (_, index) => {
    value = (value * 1664525 + 1013904223) >>> 0;
    const payload = `fixture-work-${seed}-${index}`;
    return { id: index, payload, remaining: 2 + value % 3,
      expected: createHash('sha256').update(payload).digest('hex') };
  });
}

function service(active, round) {
  const budget = active.size > 3 ? 2 : 3;
  const selected = [...active.entries()].sort((a, b) => a[1].id - b[1].id).slice(0, budget);
  const completed = [];
  for (const [workerId, job] of selected) {
    job.remaining -= 1;
    if (job.remaining > 0) continue;
    const actual = createHash('sha256').update(job.payload).digest('hex');
    completed.push({ workerId, jobId: job.id, valid: actual === job.expected, completedRound: round });
    active.delete(workerId);
  }
  return completed;
}

module.exports = { jobs, service };
