const fs = require('fs');
const os = require('os');
const path = require('path');

const genosCli = require('./genosCli');
const store = require('./agentDnaStore');
const agentDna = require('./agentDna');
const genomeEventLog = require('./genomeEventLog');

const SUPPORTED = new Set(['cross', 'mutate', 'clone', 'decoy', 'graft', 'speciate']);

function pushParam(args, flag, value) {
  if (value !== undefined && value !== null) args.push(flag, String(value));
}

function crossArgs(params, paths) {
  const args = ['genome', 'cross', '--parent-a', paths.input, '--parent-b', paths.parent, '--out', paths.output, '--force', '--parents'];
  pushParam(args, '--swap-prob', params.swapProb);
  pushParam(args, '--point', params.point);
  pushParam(args, '--seed', params.seed);
  pushParam(args, '--speciation-threshold', params.speciationThreshold);
  return args;
}

function mutateArgs(params, paths) {
  const args = ['genome', 'mutate', '--in', paths.input, '--out', paths.output, '--force', '--parents'];
  pushParam(args, '--rate', params.rate);
  pushParam(args, '--locus', params.locus);
  pushParam(args, '--seed', params.seed);
  if (params.hyper) args.push('--hyper');
  return args;
}

function cloneArgs(params, paths) {
  const args = ['genome', 'clone', '--in', paths.input, '--out', paths.output, '--force', '--parents'];
  pushParam(args, '--mode', params.mode);
  pushParam(args, '--daughter-volume', params.daughterVolume);
  pushParam(args, '--mutation-rate', params.mutationRate);
  pushParam(args, '--seed', params.seed);
  return args;
}

function decoyArgs(params, paths) {
  const args = ['genome', 'decoy', '--in', paths.input, '--out', paths.output, '--force', '--parents'];
  pushParam(args, '--selector', params.selector);
  pushParam(args, '--detectability', params.detectability);
  return args;
}

function graftArgs(params, paths) {
  const args = [
    'genome', 'graft', '--in', paths.input, '--out', paths.output,
    '--locus', String(params.locus), '--instruction', String(params.instruction),
    '--force', '--parents'
  ];
  if (params.plasmid) args.push('--plasmid');
  return args;
}

function speciateArgs(params, paths) {
  const args = [
    'genome', 'speciate', '--in', paths.input, '--out', paths.output,
    '--name', String(params.name || 'Innovated'), '--force', '--parents'
  ];
  if (params.concept) args.push('--concept', String(params.concept));
  for (const graft of params.grafts || []) {
    args.push('--graft', `${graft.locus}=${graft.instruction}`);
  }
  return args;
}

function buildArgs(operation, params, paths) {
  if (operation === 'cross') return crossArgs(params, paths);
  if (operation === 'mutate') return mutateArgs(params, paths);
  if (operation === 'clone') return cloneArgs(params, paths);
  if (operation === 'graft') return graftArgs(params, paths);
  if (operation === 'speciate') return speciateArgs(params, paths);
  return decoyArgs(params, paths);
}

async function materialize(db, id, targetPath) {
  if (!id) throw Object.assign(new Error('genomeId is required'), { code: 'GENOME_ID_REQUIRED' });
  const row = await db.get('SELECT genome_blob FROM agent_genomes WHERE id = ?', id);
  if (!row) throw Object.assign(new Error(`genome '${id}' not found`), { code: 'GENOME_NOT_FOUND' });
  fs.writeFileSync(targetPath, Buffer.from(row.genome_blob));
  return targetPath;
}

function gatherParentRefs(operation, params) {
  if (operation === 'cross' && params.parentId) {
    return [params.genomeId, params.parentId];
  }
  if (operation === 'speciate' && params.genomeId) {
    return [params.genomeId];
  }
  return null;
}

function eventTypeName(operation) {
  return {
    cross: 'CROSSOVER', mutate: 'MUTATION', clone: 'CLONE',
    graft: 'GRAFT', decoy: 'BIRTH', speciate: 'BIRTH'
  }[operation] || 'BIRTH';
}

async function logGenomeEvent({ db, operation, params, scope, model, id }) {
  const parentRefs = gatherParentRefs(operation, params);
  const eventPayload = {
    operation,
    contentHash: model.contentHash,
    source: 'agentDnaOperations.runOperation',
    name: model.meta.name,
    geneCount: Object.keys(model.genes).length,
  };
  await genomeEventLog.recordEvent(db, genomeEventLog.makeEvent(eventTypeName(operation), id, {
    parentRefs: parentRefs || undefined,
    payload: operation === 'decoy' ? { ...eventPayload, decoy: true } : eventPayload,
    organizationId: scope.organizationId,
    projectId: scope.projectId,
  }));
}

async function runOperation(db, request) {
  const operation = request.operation;
  const params = request.params || {};
  const scope = request.scope || {};
  if (!SUPPORTED.has(operation)) {
    throw Object.assign(new Error(`Unsupported genome operation '${operation}'`), { code: 'GENOME_OP_UNSUPPORTED' });
  }
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-dna-op-'));
  try {
    const paths = {
      input: await materialize(db, params.genomeId, path.join(workDir, 'input.dna')),
      output: path.join(workDir, 'output.dna')
    };
    if (operation === 'cross') {
      paths.parent = await materialize(db, params.parentId, path.join(workDir, 'parent.dna'));
    }
    const result = await genosCli.runGenos(buildArgs(operation, params, paths));
    if (!result.ok) {
      throw Object.assign(new Error(result.error || 'genome operation failed'), {
        code: 'GENOME_OP_FAILED',
        detail: result.stderr || result.stdout
      });
    }
    const model = agentDna.decodeBuffer(fs.readFileSync(paths.output));
    const id = params.outputId || `${operation}-${model.contentHash.slice(0, 16)}`;
    await store.saveGenome(db, model, { id, organizationId: scope.organizationId, projectId: scope.projectId });

    // B1: enregistrer l'événement genome_events pour cette opération
    await logGenomeEvent({ db, operation, params, scope, model, id });

    return {
      genomeRef: id,
      contentHash: model.contentHash,
      name: model.meta.name,
      operation,
      genes: Object.keys(model.genes).length
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

module.exports = { runOperation, buildArgs, SUPPORTED };
