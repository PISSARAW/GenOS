'use strict';
async function run({ operation, timeoutMs = 5000 }) {
  let timer;
  const learning = Promise.resolve().then(operation)
    .then((value) => ({ completed: true, value }),
      (error) => ({ completed: false, reason: error?.message || String(error) }));
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ completed: false, reason: 'Optional runtime learning exceeded its deadline.' }), timeoutMs);
  });
  try { return await Promise.race([learning, deadline]); }
  finally { clearTimeout(timer); }
}
module.exports = { run };
