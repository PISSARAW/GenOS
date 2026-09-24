'use strict';

const tails = new Map();

async function coordinate(key, action) {
  const previous = tails.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const tail = previous.then(() => gate);
  tails.set(key, tail);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}

function run(decision, key, action) {
  return decision.coordinationRequired ? coordinate(key, action) : action();
}

module.exports = { run };
