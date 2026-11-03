'use strict';

const inventory = require('../../backend/src/services/ontogenesis/canonicalConceptInventory');
const variants = require('../../backend/src/services/morphogenesis/registry/variantCatalog');

function counts() {
  const entries = inventory.entries();
  const topologyVariants = Object.fromEntries(variants.topologyNames().sort().map(name =>
    [name, variants.topologyVariants(name).length]));
  return { entries: entries.length, distinctIds: new Set(entries.map(item => item.id)).size,
    families: Object.keys(inventory.inventory()).length,
    philosophy: require('../../backend/src/philosophy/conceptDefinitions').CONCEPT_DEFINITIONS.length,
    organizations: Object.keys(require('../../backend/src/services/dynamicOrganizationService').ORGANIZATIONS).length,
    workers: Object.keys(require('../../backend/src/services/agents/workerKindService').KINDS).length,
    runtime: require('../../backend/src/services/conceptRegistryService').getRegistrySize(),
    graph: Object.keys(require('../../backend/src/services/capabilityGraphService').getAllConcepts()).length,
    capabilities: require('../../backend/src/services/capabilityAccessMatrix').fullMatrix().length,
    topologyVariants, variants: Object.values(topologyVariants).reduce((sum, value) => sum + value, 0) };
}

function render() {
  const values = counts();
  const rows = [
    ['Entrées canoniques / identifiants distincts', `${values.entries} / ${values.distinctIds}`],
    ['Familles canoniques', values.families], ['Concepts philosophiques', values.philosophy],
    ['Organisations Node', values.organizations], ['Types de workers', values.workers],
    ['Concepts runtime', values.runtime], ['Entrées du graphe', values.graph],
    ['Capacités topologiques', values.capabilities],
    ['Topologies / variantes', `${Object.keys(values.topologyVariants).length} / ${values.variants}`]
  ];
  return '\n## Registres de concepts\n\nCes registres se recoupent ; leurs compteurs ne s’additionnent pas. '
    + 'Une entrée ne constitue pas une qualification runtime.\n\n| Registre | Nombre |\n| --- | ---: |\n'
    + rows.map(([name, value]) => `| ${name} | ${value} |`).join('\n')
    + '\n\n| Topologie | Variantes |\n| --- | ---: |\n'
    + Object.entries(values.topologyVariants).map(([name, count]) => `| ${name} | ${count} |`).join('\n') + '\n';
}

module.exports = { counts, render };
