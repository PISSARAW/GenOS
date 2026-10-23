'use strict';

// Generateur deterministe du jeu de changement de regime.
// Seed fige: toute regeneration avec le meme seed produit le meme fichier.
// Usage: node benchmarks/topology-morphogenesis/generate-regime-change-tasks.cjs

const fs = require('fs');
const path = require('path');

const SEED = 20261015;
const root = __dirname;

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand, count, range) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push(range.min + Math.floor(rand() * (range.max - range.min + 1)));
  }
  return out;
}

function firstFitDecreasing(items, bins) {
  const sums = Array.from({ length: bins }, () => 0);
  const sorted = [...items].sort((a, b) => b.w - a.w);
  for (const item of sorted) {
    let best = 0;
    for (let i = 1; i < bins; i += 1) if (sums[i] < sums[best]) best = i;
    sums[best] += item.w;
  }
  return Math.max(...sums);
}

function makeCap(rand, index) {
  const count = 7 + (index % 3);
  const items = pick(rand, count, { min: 1, max: 6 }).map((w, i) => ({ id: `item${i + 1}`, w }));
  return { items, bins: 3, cap: firstFitDecreasing(items, 3) };
}

function capPrompt(params) {
  const list = params.items.map((item) => `${item.id}=${item.w}`).join(', ');
  return `Phase 1 (travail independant) : repartis les elements suivants en ${params.bins} groupes sans concertation : ${list}. `
    + `Contrainte revelee a mi-mission (applique-la avant la reponse finale) : aucun groupe ne doit depasser un total de ${params.cap}, `
    + `et chaque element doit appartenir a exactement un groupe. Reorganise la verification entre groupes pour respecter le plafond. `
    + `Retourne uniquement un objet JSON avec la propriete bins (tableau de ${params.bins} tableaux d'identifiants). N'utilise aucun outil.`;
}

function shuffled(rand, values) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function alphaViolates(order, edges) {
  const pos = new Map(order.map((s, i) => [s, i]));
  return edges.some(([a, b]) => pos.get(a) >= pos.get(b));
}

function makeDag(rand) {
  const steps = ['a', 'b', 'c', 'd', 'e', 'f'];
  const alpha = [...steps].sort();
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const ref = shuffled(rand, steps);
    const pairs = [];
    for (let i = 0; i < ref.length; i += 1) {
      for (let j = i + 1; j < ref.length; j += 1) pairs.push([ref[i], ref[j]]);
    }
    const chosen = shuffled(rand, pairs).slice(0, 5);
    const edges = chosen.slice(0, 3);
    const revealed = chosen.slice(3);
    if (alphaViolates(alpha, revealed) && !alphaViolates(alpha, edges)) return { steps, edges, revealedEdges: revealed };
  }
  throw new Error('DAG generation failed.');
}

function dagPrompt(params) {
  const base = params.edges.map(([a, b]) => `${a} avant ${b}`).join('; ');
  const extra = params.revealedEdges.map(([a, b]) => `${a} avant ${b}`).join('; ');
  return `Phase 1 (travail independant) : ordonne les etapes ${params.steps.join(', ')} sous les contraintes : ${base}. `
    + `Contraintes revelees a mi-mission (applique-les avant la reponse finale, elles priment) : ${extra}. `
    + `Reorganise l'integration pour que l'ordre final respecte toutes les contraintes. `
    + `Retourne uniquement un objet JSON avec la propriete order (tableau d'identifiants). N'utilise aucun outil.`;
}

function countTuples(sum, forbidden) {
  let n = 0;
  for (let a = 1; a <= sum; a += 1) {
    for (let b = a + 1; b <= sum; b += 1) {
      const c = sum - a - b;
      if (c <= b) continue;
      if ([a, b, c].some((v) => forbidden.includes(v))) continue;
      n += 1;
    }
  }
  return n;
}

function makeEnum(rand) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const sum = 13 + Math.floor(rand() * 10);
    const forbidden = [...new Set(pick(rand, 1 + Math.floor(rand() * 2), { min: 1, max: sum }))]
      .sort((a, b) => a - b);
    if (countTuples(sum, forbidden) >= 2) return { sum, forbidden };
  }
  throw new Error('ENUM generation failed.');
}

function enumPrompt(params) {
  const ban = params.forbidden.join(', ');
  return `Phase 1 (travail independant) : enumere les triplets d'entiers strictement croissants a < b < c tels que a+b+c=${params.sum}. `
    + `Filtre global revele a mi-mission (applique-le avant la reponse finale) : aucun triplet ne doit contenir ${ban}. `
    + `Reorganise la recherche pour eliminer les triplets interdits de facon exhaustive. `
    + `Retourne uniquement un objet JSON avec la propriete tuples (tableau de triplets). N'utilise aucun outil.`;
}

const FAMILIES = {
  cap: { oracle: 'verifyCapacity', adapted: 'biome', wrong: 'trinity', make: makeCap, prompt: capPrompt,
    rationale: "L'allocation puis la reallocation sous plafond observe exigent un etat de type environnement ; des mondes isoles sans rebouclage ne peuvent pas reequilibrer.",
    falsifier: "Biome ne depasse ni le controle fige ni le controle negatif en exactitude appariee, ou Trinity l'egale sans reallocation." },
  dag: { oracle: 'verifyOrder', adapted: 'metapopulation', wrong: 'rhizome', make: makeDag, prompt: dagPrompt,
    rationale: "Des populations separees avec corridors diriges et migration encadree structurent l'integration de l'ordre ; l'exploration ouverte sans graphe de dependances n'apporte pas cette garantie.",
    falsifier: "Metapopulation ne reduit pas les violations de dependances par rapport aux controles, ou Rhizome l'egale sans structure." },
  enum: { oracle: 'verifyTuples', adapted: 'trinity', wrong: 'syncytium', make: makeEnum, prompt: enumPrompt,
    rationale: "L'enumeration exhaustive beneficie de strategies isolees comparees apres cloture ; un etat partage convergeant risque de contaminer l'independance des branches.",
    falsifier: "Trinity ne depasse pas les controles en exactitude appariee, ou Syncytium l'egale sans isolation." }
};

function taskId(kind, family, n) {
  return `${kind === 'training' ? 'train' : 'rc'}-${family}-${String(n).padStart(2, '0')}`;
}

function buildSet() {
  const rand = rng(SEED);
  const tasks = [];
  const trainingInventory = { taskIds: [], taskFamilies: [], oracleIds: [] };
  for (const [family, spec] of Object.entries(FAMILIES)) {
    for (let i = 0; i < 12; i += 1) {
      const params = spec.make(rand, i);
      const training = i < 2;
      tasks.push({
        id: taskId(training ? 'training' : 'holdout', family, training ? i + 1 : i - 1),
        family: `regime-${family}`,
        split: training ? 'training' : 'holdout',
        comparisonEligible: !training,
        prompt: spec.prompt(params),
        oracle: spec.oracle,
        oracleId: `regime-${family}-v1`,
        oracleParams: params,
        adaptedTopology: spec.adapted,
        wrongTopology: spec.wrong,
        rationale: spec.rationale,
        primaryMetric: family === 'dag' ? 'constraint-satisfaction' : 'exact-oracle-match',
        falsifier: spec.falsifier
      });
      if (training) trainingInventory.taskIds.push(taskId('training', family, i + 1));
    }
    trainingInventory.taskFamilies.push(`regime-${family}`);
    trainingInventory.oracleIds.push(`regime-${family}-v1`);
  }
  return { tasks, trainingInventory };
}

function main() {
  const { tasks, trainingInventory } = buildSet();
  const holdout = tasks.filter((t) => t.split === 'holdout');
  if (holdout.length !== 30) throw new Error(`Expected 30 holdout tasks, got ${holdout.length}.`);
  const data = { version: 2, status: 'frozen-regime-change-v2', seed: SEED,
    trainingInventory, tasks,
    revealSpec: 'La contrainte de phase 2 est contenue dans le prompt ; le moment de revelation est la frontiere entre le diagnostic initial et la synthese finale.',
    budgets: { tokens: 20000, latencyMs: 240000, minimumWorkerTokens: 1500, workerShare: 0.7 } };
  fs.writeFileSync(path.join(root, 'regime-change-task-set.json'), `${JSON.stringify(data, null, 2)}\n`);
  process.stdout.write(`wrote ${tasks.length} tasks (${holdout.length} holdout)\n`);
}

if (require.main === module) main();
module.exports = { buildSet, SEED };
