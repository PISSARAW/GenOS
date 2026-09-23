'use strict';

function asSet(values) {
  return new Set((values || []).map((v) => String(v)));
}

function minus(left, right) {
  return [...left].filter((v) => !right.has(v));
}

function attributionVerdict(run, contract) {
  const r = run || {};
  const declared = asSet(r.declared_capabilities);
  const activated = asSet(r.activated_capabilities);
  const observed = asSet(r.observed_capabilities);
  const required = asSet(contract && contract.required);
  const unscoped = minus(activated, declared);
  const dormant = required.size ? minus(required, activated) : [];
  const inert = minus(activated, observed);
  const ghost = minus(observed, activated);
  const verdict = pickVerdict({ unscoped, dormant, inert, ghost });
  return {
    topology: r.topology || null,
    verdict,
    attributable: verdict === 'attributable',
    unscopedActivation: [...unscoped],
    contractOnly: [...dormant],
    leasedWithoutEffect: [...inert],
    observedWithoutLease: [...ghost],
    kind: 'metric',
    qualityGuarantee: false
  };
}

function pickVerdict(gaps) {
  if (gaps.unscoped.length) return 'unscoped_activation';
  if (gaps.ghost.length) return 'observed_without_lease';
  if (gaps.inert.length) return 'leased_without_effect';
  if (gaps.dormant.length) return 'contract_only';
  return 'attributable';
}

module.exports = { attributionVerdict };
