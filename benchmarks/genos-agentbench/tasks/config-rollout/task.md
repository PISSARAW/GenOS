# Transactional configuration rollout

Repair `rollout.mjs` without changing its public API.

Versions are positive, strictly increasing integers. `publish` atomically adds
a version with a rollout percentage from 0 through 100 and a plain-object
configuration. Users are assigned deterministically using the supplied `hash`
function modulo 100: buckets below the newest rollout percentage receive the
new version, otherwise the previous active version. `rollback(version)` makes
an existing version the sole active version without deleting history. Cached
lookups must never survive publish or rollback. Invalid operations must leave
all state unchanged. Inputs and returned configurations must be defensively
copied so callers cannot mutate stored state.

Run `node --test public.test.mjs`. Do not read files outside this task directory.
