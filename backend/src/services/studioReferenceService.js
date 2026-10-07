'use strict';
const crypto = require('node:crypto');
const { agent, failure } = require('./studioWorldsService');
const input = require('./studioSpecialistInput');

function namespace(value = 'canonical') {
  if (!['canonical', 'runtime', 'philosophy'].includes(value)) throw failure('REFERENCE_NAMESPACE_INVALID', 400);
  return value;
}

function entries(source) {
  if (source === 'philosophy') return require('./philosophyRouter').listConcepts().map(item => ({ id: item.id, name: item.label,
    domain: item.domain, school: item.school, status: item.status, source: 'philosophy_registry',
    maturity: item.serviceMaturity.level, classification: item.classification, runtimeAuthority: item.runtimeAuthority, runtimeVerified: false }));
  if (source === 'canonical') return require('./ontogenesis/canonicalConceptInventory').entries().map(item => ({
    id: item.domain + ':' + item.id, name: item.id, domain: item.domain, source: 'canonical_inventory', status: 'documented', runtimeVerified: false }));
  const catalog = require('./ontogenesis/canonicalConceptRegistry').conceptCatalog();
  return catalog.map(item => ({ id: item.source + ':' + item.domain + ':' + item.id, name: item.id,
    domain: item.domain, source: item.source, status: item.state, executableDeclared: item.executable, runtimeVerified: false }));
}

function pageNumber(value, fallback, maximum) {
  const resolved = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(resolved) || resolved < 0 || resolved > maximum) throw failure('REFERENCE_PAGE_INVALID', 400);
  return resolved;
}

function queryFilter(query) {
  const q = String(query.q || '').toLowerCase();
  const domain = String(query.domain || '');
  if (q.length > 200 || domain.length > 200) throw failure('REFERENCE_QUERY_INVALID', 400);
  return { q, domain };
}

async function list(db, context) {
  await agent(db, context);
  const source = namespace(context.query.namespace);
  const { q, domain } = queryFilter(context.query);
  const rows = [...new Map(entries(source).map(item => [item.id, item])).values()].sort((a, b) => a.id.localeCompare(b.id));
  const catalogHash = crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  if (context.query.catalogHash && context.query.catalogHash !== catalogHash) throw failure('REFERENCE_CATALOG_CHANGED', 409);
  const filtered = rows.filter(item => (!domain || item.domain === domain) && (item.id + ' ' + item.name).toLowerCase().includes(q));
  const offset = pageNumber(context.query.offset, 0, 1000000);
  const limit = pageNumber(context.query.limit, 50, 100);
  if (!limit) throw failure('REFERENCE_PAGE_INVALID', 400);
  const hasMore = offset + limit < filtered.length;
  return { namespace: source, items: filtered.slice(offset, offset + limit), total: filtered.length,
    domains: [...new Set(rows.map(item => item.domain))].sort(), offset, limit, hasMore,
    nextOffset: hasMore ? offset + limit : null, catalogHash, runtimeVerified: false, promotionGranted: false };
}

async function inspect(db, context) {
  await agent(db, context);
  const source = namespace(context.query.namespace);
  const id = input.text(context.query.id, 500);
  const concept = entries(source).find(item => item.id === id);
  if (!concept) throw failure('REFERENCE_CONCEPT_NOT_FOUND', 404);
  if (source !== 'philosophy') return { concept, runtimeVerified: false, promotionGranted: false };
  const philosophy = require('./philosophyRouter');
  const neighborhood = philosophy.getNeighborhood(id);
  return { concept: philosophy.getConcept(id), contract: philosophy.getImplementationContract(id),
    relations: neighborhood.relations.slice(0, 100), neighbors: neighborhood.neighbors.slice(0, 100),
    runtimeVerified: false, promotionGranted: false };
}

function formula(value) {
  const source = input.text(value, 200);
  const names = new Set(source.match(/[A-Za-z][A-Za-z0-9_]*/g) || []);
  if (names.size > 8) throw failure('LOGIC_ATOM_LIMIT', 400);
  return source;
}

async function logic(db, context) {
  await agent(db, context);
  const source = formula(context.body.formula);
  let result;
  try { result = require('./propositionalLogicService').classifyFormula({ formula: source }); }
  catch (_) { throw failure('LOGIC_FORMULA_INVALID', 400); }
  return input.record(db, context, { mechanism: 'propositional_logic', input: { formula: source },
    result: { formula: source, classification: result.result, atoms: result.atoms,
      rows: result.rows.map(row => ({ ...row, name: Object.entries(row.valuation).map(([atom, value]) => atom + '=' + value).join(', '),
        status: row.value ? 'vrai' : 'faux' })),
      rowCount: result.rows.length, inputAuthority: 'declared', semanticScope: 'classical_propositional',
      externalFactsVerified: false, promotionEligible: false, runtimeApplied: false } });
}

module.exports = { list, inspect, logic };
