'use strict';

/**
 * Anomaly Detector Registry — ADR 0034 D8/D12.
 *
 * Détecteurs DÉTERMINISTES : signal → Observation, jamais Bug.
 * Chaque détecteur renvoie des observations falsifiables ; c'est
 * Natural Search (D7) qui construit l'hypothèse si nécessaire.
 * pickCandidateFile() au mtime est obsolète : la localisation
 * vient des signaux + du graphe, pas de la date de modification.
 *
 * Contexte : { territoryId, headSha, rootPath, files[], events[] }
 * (events = lignes daemon_events récentes, payload_json parsé).
 */

const fs = require('node:fs');
const path = require('node:path');
const jsAdapter = require('../cartography/languageAdapters/javascriptAdapter');
const eventLog = require('../daemonEventLog');

const customDetectors = new Map();

function registerDetector(detector) {
  if (!detector || !detector.id || typeof detector.detect !== 'function') {
    return { registered: false, reason: 'invalid-detector' };
  }
  customDetectors.set(detector.id, detector);
  return { registered: true, id: detector.id };
}

function defaultDetectors() {
  return [
    { id: 'test-regression', detect: detectTestRegression },
    { id: 'flaky-signal', detect: detectFlakySignal },
    { id: 'broken-import', detect: detectBrokenImport },
    { id: 'missing-sibling-test', detect: detectMissingSiblingTest },
    { id: 'secret-exposure', detect: detectSecretExposure },
    { id: 'repeated-failure', detect: detectRepeatedFailure },
    { id: 'unintegrated-component', detect: detectUnintegratedComponent },
    { id: 'stale-documentation', detect: detectStaleDocumentation }
  ];
}

function allDetectors() {
  return [...defaultDetectors(), ...customDetectors.values()];
}

function runDetectors(detectors, context) {
  const observations = [];
  for (const detector of detectors || []) {
    try {
      const found = detector.detect(context) || [];
      for (const observation of found) {
        observations.push({ detectorId: detector.id, ...observation });
      }
    } catch (_) {
      continue;
    }
  }
  return observations;
}

function scopeKeyOf(event) {
  const payload = eventLog.parsePayload(event);
  return payload.file || payload.scope || 'unknown';
}

function groupByScope(events, type) {
  const groups = new Map();
  for (const event of events || []) {
    if (event.event_type !== type) continue;
    const key = scopeKeyOf(event);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return groups;
}

function scopeOfFile(file) {
  if (!file || file === 'unknown') return { type: 'cross-cutting', value: 'territory' };
  if (file.includes('.test.') || file.includes('.spec.')) return { type: 'test', value: file };
  return { type: 'file', value: file };
}

function detectTestRegression(context) {
  const groups = groupByScope(context.events, 'TEST_FAILED');
  const observations = [];
  for (const [scope, occurrences] of groups) {
    if (occurrences.length < 2 || scope === 'unknown') continue;
    observations.push({
      territoryId: context.territoryId,
      headSha: context.headSha,
      claim: `test scope ${scope} failed ${occurrences.length} times in window`,
      scope: scopeOfFile(scope),
      severity: occurrences.length >= 3 ? 'high' : 'medium',
      falsification: 'scope passes twice consecutively without code change'
    });
  }
  return observations;
}

function detectFlakySignal(context) {
  const failed = groupByScope(context.events, 'TEST_FAILED');
  const recovered = groupByScope(context.events, 'TEST_RECOVERED');
  const observations = [];
  for (const [scope, failures] of failed) {
    if (scope === 'unknown' || !(recovered.get(scope) || []).length) continue;
    observations.push({
      territoryId: context.territoryId,
      headSha: context.headSha,
      claim: `test scope ${scope} failed then recovered without recorded fix — outcome unstable`,
      scope: scopeOfFile(scope),
      severity: 'medium',
      falsification: `${failures.length + 1} consecutive deterministic outcomes either way`
    });
  }
  return observations;
}

function detectBrokenImport(context) {
  const observations = [];
  for (const file of context.files || []) {
    const broken = brokenImportsInFile(context, file);
    for (const spec of broken) {
      observations.push({
        territoryId: context.territoryId,
        headSha: context.headSha,
        claim: `${file} imports unresolvable relative specifier ${spec}`,
        scope: { type: 'file', value: file },
        severity: 'high',
        falsification: 'specifier resolves to an existing file'
      });
    }
  }
  return observations;
}

function brokenImportsInFile(context, file) {
  if (!file.endsWith('.js') && !file.endsWith('.cjs') && !file.endsWith('.mjs') && !file.endsWith('.ts')) return [];
  let content = null;
  try {
    content = fs.readFileSync(path.join(context.rootPath, file), 'utf8');
  } catch (_) {
    return [];
  }
  const parsed = jsAdapter.parseJavaScript(content);
  return parsed.imports.filter((spec) => !resolvesFromFile(context, file, spec));
}

function resolvesFromFile(context, file, spec) {
  const abs = path.resolve(path.dirname(path.join(context.rootPath, file)), spec);
  const candidates = ['', '.js', '.ts', '.mjs', '.cjs', '/index.js'];
  for (const suffix of candidates) {
    try {
      if (fs.statSync(abs + suffix).isFile()) return true;
    } catch (_) {
      continue;
    }
  }
  return false;
}

function detectMissingSiblingTest(context) {
  const observations = [];
  for (const file of context.files || []) {
    if (!isSourceFile(file) || hasSiblingTest(context, file)) continue;
    observations.push({
      territoryId: context.territoryId,
      headSha: context.headSha,
      claim: `changed source ${file} has no sibling test covering it`,
      scope: { type: 'file', value: file },
      severity: 'low',
      falsification: 'a test file covering this module exists'
    });
  }
  return observations;
}

function isSourceFile(file) {
  if (!file.endsWith('.js') && !file.endsWith('.ts') && !file.endsWith('.cjs') && !file.endsWith('.mjs')) return false;
  return !file.includes('.test.') && !file.includes('.spec.');
}

function hasSiblingTest(context, file) {
  const dir = path.dirname(path.join(context.rootPath, file));
  const base = path.basename(file).replace(/\.(js|ts|cjs|mjs)$/, '');
  const candidates = [`${base}.test.js`, `${base}.test.ts`, `${base}.spec.js`, `test_${base}.js`];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(path.join(dir, candidate)).isFile()) return true;
    } catch (_) {
      continue;
    }
  }
  return false;
}

/**
 * Security phenotype sensor (déterministe) : n'affirme jamais une
 * compromission, signale un motif à vérifier en sandbox par un worker.
 */
function detectSecretExposure(context) {
  const observations = [];
  for (const file of context.files || []) {
    const hit = firstSecretHit(context, file);
    if (hit) {
      observations.push({
        territoryId: context.territoryId,
        headSha: context.headSha,
        claim: `${file} contains secret-like pattern (${hit}) — map, do not touch`,
        scope: { type: 'file', value: file },
        severity: 'high',
        falsification: 'pattern is a placeholder, test fixture, or vault reference'
      });
    }
  }
  return observations;
}

const SECRET_PATTERNS = [
  'AKIA[0-9A-Z]{16}',
  'xox[baprs]-[A-Za-z0-9-]+',
  'ghp_[A-Za-z0-9]{20,}',
  '-----BEGIN (RSA )?PRIVATE KEY-----',
  'sk-live-[A-Za-z0-9]+'
];

function firstSecretHit(context, file) {
  let content = null;
  try {
    content = fs.readFileSync(path.join(context.rootPath, file), 'utf8');
  } catch (_) {
    return null;
  }
  if (content.length > 500000) return null;
  for (const pattern of SECRET_PATTERNS) {
    try {
      if (new RegExp(pattern).test(content)) return pattern.slice(0, 24);
    } catch (_) {
      continue;
    }
  }
  return null;
}

/**
 * Historian phenotype sensor : échec répété dans la durée (prior
 * historique, pas vérité). Se distingue de test-regression (fenêtre
 * courte) par l'exigence fail → recovered → fail.
 */
function detectRepeatedFailure(context) {
  const failed = groupByScope(context.events, 'TEST_FAILED');
  const recovered = groupByScope(context.events, 'TEST_RECOVERED');
  const observations = [];
  for (const [scope, failures] of failed) {
    if (scope === 'unknown' || failures.length < 3) continue;
    if (!(recovered.get(scope) || []).length) continue;
    observations.push({
      territoryId: context.territoryId,
      headSha: context.headSha,
      claim: `test scope ${scope} failed ${failures.length} times with recovery in between — recurrent history`,
      scope: scopeOfFile(scope),
      severity: 'medium',
      falsification: 'scope passes 5 times consecutively without code change'
    });
  }
  return observations;
}

/**
 * Chaperone phenotype sensor : structure neuve (fichier changé) non
 * intégrée — ni test sibling, ni import relatif entrant/sortant
 * (défaut de repliement d'intégration).
 */
function detectUnintegratedComponent(context) {
  const observations = [];
  for (const file of context.files || []) {
    if (!isSourceFile(file) || hasSiblingTest(context, file)) continue;
    if (relativeImportCount(context, file) > 0) continue;
    observations.push({
      territoryId: context.territoryId,
      headSha: context.headSha,
      claim: `new component ${file} has no sibling test and no relative imports — possibly unfolded`,
      scope: { type: 'file', value: file },
      severity: 'medium',
      falsification: 'component is registered, imported, or tested elsewhere'
    });
  }
  return observations;
}

function relativeImportCount(context, file) {
  let content = null;
  try {
    content = fs.readFileSync(path.join(context.rootPath, file), 'utf8');
  } catch (_) {
    return 1;
  }
  const parsed = jsAdapter.parseJavaScript(content);
  return (parsed.imports || []).filter((spec) => spec.startsWith('.')).length;
}

/**
 * Documentation phenotype sensor : source changée dont le doc sibling
 * (.md même basename) existe mais n'a pas changé dans la fenêtre.
 */
function detectStaleDocumentation(context) {
  const observations = [];
  const changed = new Set(context.files || []);
  for (const file of changed) {
    const doc = siblingDocPath(context, file);
    if (!doc || changed.has(doc)) continue;
    observations.push({
      territoryId: context.territoryId,
      headSha: context.headSha,
      claim: `changed source ${file} has sibling doc ${doc} unchanged in window — drift candidate`,
      scope: { type: 'file', value: file },
      severity: 'low',
      falsification: 'doc does not describe the changed behavior'
    });
  }
  return observations;
}

function siblingDocPath(context, file) {
  if (!isSourceFile(file)) return null;
  const dir = path.dirname(path.join(context.rootPath, file));
  const base = path.basename(file).replace(/\.(js|ts|cjs|mjs)$/, '');
  const candidates = [`${base}.md`, `${base}.doc.md`, `${base}.README.md`];
  const relDir = path.dirname(file);
  for (const candidate of candidates) {
    try {
      if (fs.statSync(path.join(dir, candidate)).isFile()) {
        return relDir === '.' ? candidate : `${relDir}/${candidate}`;
      }
    } catch (_) {
      continue;
    }
  }
  return null;
}

module.exports = {
  registerDetector,
  defaultDetectors,
  allDetectors,
  runDetectors
};
