'use strict';

const IMPLEMENTATION_DISPOSITIONS = Object.freeze([
  'reference-only',
  'bounded-audit',
  'runtime-capability',
]);

const DETAILS = Object.freeze({
  'reference-only': Object.freeze({
    description: 'Référence descriptive sans service métier exécutable.',
    sourceServiceExecutable: false,
    runtimeCapability: false,
    allowedUse: 'description-and-shared-audit',
    knownLimits: Object.freeze([
      'Le profil d audit partagé ne transforme pas cette référence en fonctionnalité métier.',
      'Aucune affirmation métaphysique ou subjective ne peut être promue par ce classement.',
    ]),
  }),
  'bounded-audit': Object.freeze({
    description: 'Service observable par un audit logiciel borné, sans autorité runtime.',
    sourceServiceExecutable: true,
    runtimeCapability: false,
    allowedUse: 'bounded-software-audit',
    knownLimits: Object.freeze([
      'Le service traite des entrées déclarées et ne vérifie pas leur vérité externe.',
      'Un audit satisfait ne crée ni permission, ni lease, ni droit de promotion.',
    ]),
  }),
  'runtime-capability': Object.freeze({
    description: 'Capacité runtime déclarée et adossée à un service exécutable.',
    sourceServiceExecutable: true,
    runtimeCapability: true,
    allowedUse: 'existing-authorized-runtime-path',
    knownLimits: Object.freeze([
      'La capacité reste soumise aux permissions, leases, budgets et preuves de son runtime.',
      'Le contrat philosophique décrit et audite la capacité ; il ne l autorise pas.',
    ]),
  }),
});

function dispositionName(serviceMaturity, runtimeAuthority) {
  if (serviceMaturity?.executable !== true) return 'reference-only';
  return runtimeAuthority === true ? 'runtime-capability' : 'bounded-audit';
}

function implementationDispositionFor(serviceMaturity, runtimeAuthority) {
  const name = dispositionName(serviceMaturity, runtimeAuthority);
  return {
    name,
    ...DETAILS[name],
    knownLimits: [...DETAILS[name].knownLimits],
    runtimeAuthorityGranted: false,
    promotionEligible: false,
  };
}

function dispositionCounts(concepts) {
  return Object.fromEntries(IMPLEMENTATION_DISPOSITIONS.map((name) => [
    name,
    concepts.filter((concept) => concept.implementationDisposition === name).length,
  ]));
}

function expectedDisposition(details) {
  if (!details) return null;
  if (details.sourceServiceExecutable !== true) return 'reference-only';
  if (details.runtimeCapability === true) return 'runtime-capability';
  return 'bounded-audit';
}

function conceptCapabilityMatches(concept, details) {
  if (!details) return false;
  if (concept.kind !== 'PhilosophicalConcept') return true;
  const expected = concept.serviceMaturity?.executable === true && concept.runtimeAuthority === true;
  return details.runtimeCapability === expected;
}

function dispositionErrors(concept) {
  const disposition = concept.implementationDisposition;
  const details = concept.implementationDispositionDetails;
  const expected = expectedDisposition(details);
  const checks = [
    [IMPLEMENTATION_DISPOSITIONS.includes(disposition), 'implementationDisposition is invalid'],
    [details?.name === disposition, 'implementationDispositionDetails must identify the disposition'],
    [disposition === expected, `implementationDisposition must be ${expected}`],
    [details?.sourceServiceExecutable === (concept.serviceMaturity?.executable === true),
      'implementation disposition must match service maturity'],
    [conceptCapabilityMatches(concept, details),
      'runtime capability must match executable service and declared authority'],
    [details?.runtimeAuthorityGranted === false,
      'the philosophical contract must not grant runtime authority'],
    [details?.promotionEligible === false, 'the philosophical contract must not grant promotion'],
  ];
  return checks.filter(([valid]) => !valid).map(([, message]) => message);
}

module.exports = {
  IMPLEMENTATION_DISPOSITIONS,
  implementationDispositionFor,
  dispositionCounts,
  dispositionErrors,
};
