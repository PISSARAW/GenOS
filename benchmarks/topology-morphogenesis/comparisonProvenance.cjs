'use strict';

const ADAPTER_METADATA = Object.freeze({
  'direct-model': { provenance: 'local-config', externalFramework: 'none', scope: 'local-baseline' },
  'fixed-team': { provenance: 'local-config', externalFramework: 'none', scope: 'local-baseline' },
  'conditional-router': { provenance: 'local-config', externalFramework: 'none', scope: 'local-baseline' },
  'communication-light': { provenance: 'local-config', externalFramework: 'none', scope: 'local-baseline' },
  'genos-full': { provenance: 'local-config', externalFramework: 'none', scope: 'local-runtime' },
  'external-paired-pending': { provenance: 'external-paired-pending', externalFramework: 'pending', scope: 'external-paired' }
});

const EXTERNAL_PROTOCOL_REQUIREMENTS = Object.freeze({ sameTasks: true, sameSeeds: true,
  sameBudgets: true, sharedIndependentOracle: true, realConcurrentExecution: true,
  fields: ['externalFramework', 'externalAdapterVersion', 'externalProtocol', 'tasks', 'seeds', 'budgets', 'oracle'] });

function adapterProvenance(name) {
  const meta = ADAPTER_METADATA[name];
  if (!meta) throw new Error(`Adaptateur inconnu : ${name}.`);
  return meta;
}

function validateConditionProvenance(condition) {
  const meta = adapterProvenance(condition.adapter);
  if (meta.externalFramework === 'none' && condition.externalFramework && condition.externalFramework !== 'none') {
    throw new Error(`L'adaptateur local ${condition.adapter} ne peut pas etre labellise externe (${condition.id}).`);
  }
  return meta;
}

function isExternalPairedReady(condition) {
  const meta = ADAPTER_METADATA[condition.adapter];
  return Boolean(meta && meta.scope === 'external-paired' && condition.externalFramework
    && condition.externalFramework !== 'none' && condition.externalFramework !== 'pending' && condition.externalProtocol);
}

function assertExternalComparisonAllowed(conditions, claim) {
  const list = Array.isArray(conditions) ? conditions : [];
  if (list.some(isExternalPairedReady)) return true;
  throw new Error(`Aucune comparaison directe avec systemes concurrents etablie (${claim || 'allegation inter-frameworks'}) : aucun adaptateur external-paired enregistre avec protocole commun (memes taches/graines/budgets/oracle, execution reelle via le framework concurrent).`);
}

async function externalPairedPending() {
  throw new Error('Comparaison externe appariee indisponible : aucun framework concurrent execute via le protocole commun (voir comparison-plan.json externalProtocol).');
}

module.exports = { ADAPTER_METADATA, EXTERNAL_PROTOCOL_REQUIREMENTS, adapterProvenance,
  validateConditionProvenance, isExternalPairedReady, assertExternalComparisonAllowed, externalPairedPending };
