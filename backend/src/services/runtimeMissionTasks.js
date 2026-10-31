'use strict';

// The public missionStarts map releases an identity before recovery can reuse it.
// Keep the complete promise lifetime separately for foreground SQLite ownership.
const pending = new Set();

function track(task) {
  pending.add(task);
  task.then(() => pending.delete(task), () => pending.delete(task));
  return task;
}

function hasPending() { return pending.size > 0; }

async function drain() {
  while (pending.size) await Promise.allSettled([...pending]);
}

module.exports = { track, hasPending, drain };
