'use strict';

async function commitMutation(context) {
  const { session, changes, persist } = context;
  const previous = Object.fromEntries(Object.keys(changes).map((key) => [key, session[key]]));
  Object.assign(session, changes);
  try {
    await persist(session);
  } catch (error) {
    Object.assign(session, previous);
    throw error;
  }
}

module.exports = { commitMutation };
