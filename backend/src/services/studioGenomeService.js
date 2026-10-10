'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const dna = require('./agentDna');
const store = require('./agentDnaStore');
const events = require('./genomeEventLog');
const { failure } = require('./studioWorldsService');

async function source(db, context) {
  const row = await db.get('SELECT * FROM agent_genomes WHERE id = ? AND organization_id = ? AND project_id = ?',
    context.genomeId, context.scope.organizationId, context.scope.projectId);
  if (!row) throw failure('GENOME_NOT_FOUND', 404);
  if (row.genome_blob.length > 4 * 1024 * 1024) throw failure('GENOME_SIZE_LIMIT', 413);
  const model = dna.decodeBuffer(Buffer.from(row.genome_blob));
  if (model.contentHash !== row.content_hash) throw failure('GENOME_INTEGRITY_INVALID', 409);
  return { row, model };
}

async function list(db, context) {
  const genomes = await db.all(`SELECT id, name, content_hash, status, source_doc, created_at FROM agent_genomes
    WHERE organization_id = ? AND project_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`,
  context.scope.organizationId, context.scope.projectId);
  return { genomes, limit: 100, automaticPromotion: false };
}

async function inspect(db, context) {
  const { row, model } = await source(db, context);
  const container = require('./agentDna/container').decodeContainer(Buffer.from(row.genome_blob));
  return { genome: { id: row.id, name: model.meta.name, status: row.status, contentHash: model.contentHash,
    generation: model.meta.generation, signed: model.signed, signatureValid: model.signatureValid,
    declaredPhenotype: model.phenotype, provenance: model.provenance },
    sections: [...container.sections].map(([name, bytes]) => ({ name, bytes: bytes.length })),
    genes: Object.entries(model.genes).slice(0, 100).map(([name, gene]) => ({ name, ...gene })),
    geneCount: Object.keys(model.genes).length, geneDisplayLimit: 100, functionalEffectMeasured: false, automaticPromotion: false };
}

function parameters(body) {
  if (typeof body.rate !== 'number' || !Number.isFinite(body.rate) || body.rate < 0 || body.rate > 1) throw failure('MUTATION_RATE_INVALID', 400);
  if (typeof body.seed !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(body.seed)) throw failure('MUTATION_SEED_INVALID', 400);
  if (!/^[a-f0-9]{64}$/.test(body.contentHash || '')) throw failure('GENOME_VERSION_REQUIRED', 400);
  return { rate: body.rate, seed: body.seed };
}

function pointParameters(body) {
  if (typeof body.locus !== 'string' || !/^[A-Z0-9_]{1,64}$/.test(body.locus)) throw failure('MUTATION_LOCUS_INVALID', 400);
  if (body.locus.startsWith('LOCUS_INSTINCT_')) throw failure('MUTATION_LOCUS_PROTECTED', 400);
  if (!Number.isSafeInteger(body.position) || body.position < 0) throw failure('MUTATION_POSITION_INVALID', 400);
  if (!/^[ACGT]$/.test(body.base || '')) throw failure('MUTATION_BASE_INVALID', 400);
  if (!/^[a-f0-9]{64}$/.test(body.contentHash || '')) throw failure('GENOME_VERSION_REQUIRED', 400);
  return { locus: body.locus, position: body.position, base: body.base };
}

function pointOriginalBase(raw, params) {
  const sections = require('./agentDna/container').decodeContainer(raw).sections;
  const genes = require('msgpackr').unpack(sections.get('GENE'));
  const gene = genes[params.locus];
  if (!gene || params.position >= gene[2]) throw failure('MUTATION_TARGET_INVALID', 400);
  const packed = Buffer.from(gene[1]);
  const byte = packed[Math.floor(params.position / 4)];
  return 'ACGT'[(byte >> ((3 - (params.position % 4)) * 2)) & 3];
}

async function nativeCandidate(input) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-studio-dna-'));
  try {
    const paths = { input: path.join(root, 'source.dna'), output: path.join(root, 'candidate.dna') };
    fs.writeFileSync(paths.input, input.raw);
    const args = input.point
      ? ['genome', 'point-mutate', '--in', paths.input, '--out', paths.output, '--force',
        '--locus', input.params.locus, '--position', String(input.params.position), '--base', input.params.base]
      : require('./agentDnaOperations').buildArgs('mutate', input.params, paths);
    const result = await require('./genosCli').runGenos(args, { timeoutMs: 15000 });
    if (!result.ok) throw failure('GENOME_NATIVE_UNAVAILABLE', 503, result.error || result.stderr);
    return dna.decodeFile(paths.output);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

async function pointMutate(db, context) {
  const params = pointParameters(context.body);
  const original = await source(db, context);
  if (original.model.contentHash !== context.body.contentHash) throw failure('GENOME_VERSION_CONFLICT', 409);
  const originalBase = pointOriginalBase(Buffer.from(original.row.genome_blob), params);
  if (originalBase === params.base) throw failure('GENOME_MUTATION_NO_CHANGE', 409);
  const candidate = await nativeCandidate({ params, raw: Buffer.from(original.row.genome_blob), point: true });
  if (candidate.contentHash === original.model.contentHash) throw failure('GENOME_MUTATION_NO_CHANGE', 409);
  return withTransaction(db, async () => {
    const current = await source(db, context);
    if (current.model.contentHash !== context.body.contentHash) throw failure('GENOME_VERSION_CONFLICT', 409);
    const id = 'studio-point-candidate-' + crypto.randomUUID();
    await store.saveGenome(db, candidate, { id, organizationId: context.scope.organizationId,
      projectId: context.scope.projectId, status: 'candidate' });
    const event = await events.recordMutation(db, id, { ...context.scope, parentGenomeRefs: [original.row.id],
      payload: { actor: context.actor, sourceHash: original.model.contentHash,
        contentHash: candidate.contentHash, kind: 'point', ...params } });
    return { genomeRef: id, sourceGenomeId: original.row.id, sourceHash: original.model.contentHash,
      contentHash: candidate.contentHash, eventId: event.id, status: 'candidate', kind: 'point',
      ...params, functionalEffectMeasured: false, promotionGranted: false, deployed: false };
  });
}

async function mutate(db, context) {
  const params = parameters(context.body);
  const original = await source(db, context);
  if (original.model.contentHash !== context.body.contentHash) throw failure('GENOME_VERSION_CONFLICT', 409);
  const candidate = await nativeCandidate({ params, raw: Buffer.from(original.row.genome_blob) });
  return withTransaction(db, async () => {
    const current = await source(db, context);
    if (current.model.contentHash !== context.body.contentHash) throw failure('GENOME_VERSION_CONFLICT', 409);
    const id = 'studio-candidate-' + crypto.randomUUID();
    await store.saveGenome(db, candidate, { id, organizationId: context.scope.organizationId,
      projectId: context.scope.projectId, status: 'candidate' });
    const event = await events.recordMutation(db, id, { ...context.scope, parentGenomeRefs: [original.row.id],
      payload: { actor: context.actor, sourceHash: original.model.contentHash, contentHash: candidate.contentHash, ...params } });
    return { genomeRef: id, sourceGenomeId: original.row.id, sourceHash: original.model.contentHash,
      contentHash: candidate.contentHash, eventId: event.id, status: 'candidate', ...params,
      functionalEffectMeasured: false, promotionGranted: false, deployed: false };
  });
}

module.exports = { list, inspect, mutate, pointMutate };
