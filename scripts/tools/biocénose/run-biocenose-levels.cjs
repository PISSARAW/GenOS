#!/usr/bin/env node
// Biocénose levels — lance les 6 missions de délibération communautaire
// via les primitives réelles de GenOS : biocenoseService, memberInvocation,
// runBiocenoseRound, finalizeCommunityJudgment.
// Sorties légitimes : consensus, PARETO_PLURALISM, IRREDUCIBLE_DISAGREEMENT,
// REQUEST_MORE_EVIDENCE, HUMAN_JUDGMENT_REQUIRED, ESCALATE_EXPERIMENT.
'use strict';

const path = require('path');
const fs = require('fs');

// Positionnement: le script est dans scripts/tools/biocénose/
const SCRIPT_DIR = __dirname;
const ROOT = path.resolve(SCRIPT_DIR, '../../..');  // GenOS racine
const BACKEND_NPM = process.env.GENOS_BACKEND_NODE_MODULES || path.join(ROOT, 'backend/node_modules');
const BACKEND_SRC = path.join(ROOT, 'backend/src');

// Vérification précoce
if (!fs.existsSync(BACKEND_NPM)) {
  console.error('ERREUR: backend/node_modules introuvable à:', BACKEND_NPM);
  console.error('ROOT:', ROOT);
  process.exit(1);
}

// Charger .env depuis la racine GenOS
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

// Chargement explicite des modules C++ (sqlite3) et JS (sqlite) via chemins absolus
// Important : node sous bash MSYS ne supporte pas les chemins POSIX (slash) pour require(),
// il faut utiliser des chemins natifs Windows (backslash ou C:/).
// On utilise path.win32 pour garantir des backslashes.
const SQLITE3_PATH = path.win32.join(BACKEND_NPM, 'sqlite3/lib/sqlite3.js');
const SQLITEJS_PKG_PATH = path.win32.join(BACKEND_NPM, 'sqlite/package.json');
const SQLITE_PATH = path.win32.join(BACKEND_NPM, 'sqlite/build/index.js');

if (!fs.existsSync(SQLITE3_PATH)) {
  console.error('ERREUR: sqlite3 non trouvé à:', SQLITE3_PATH);
  process.exit(1);
}
if (!fs.existsSync(SQLITE_PATH)) {
  console.error('ERREUR: sqlite (package npm) non trouvé à:', SQLITE_PATH);
  console.error('Installation requise: cd backend && npm install sqlite --no-save');
  process.exit(1);
}

const sqlite3 = require(SQLITE3_PATH).verbose();
const { open } = require(SQLITE_PATH);

// Services GenOS
const biocenose = require(path.join(BACKEND_SRC, 'services/biocenoseService'));
const protocolHandlers = require(path.join(BACKEND_SRC, 'services/biocenose/runtime/protocolHandlers'));
const communityStore = require(path.join(BACKEND_SRC, 'services/biocenose/communityStore'));
const variantPolicies = require(path.join(BACKEND_SRC, 'services/biocenose/variants/variantPolicyRouter'));

// ============================================================================
// Configuration Ollama
// ============================================================================

const OLLAMA_BASE = process.env.GENOS_OLLAMA_ENDPOINT
  ? new URL(process.env.GENOS_OLLAMA_ENDPOINT).origin
  : 'http://localhost:11434';

const MODEL_NAME = process.env.GENOS_MODEL_NAME || 'qwen2.5-coder:7b';

console.error('[Biocénose] Ollama:', OLLAMA_BASE, '| Modèle:', MODEL_NAME);

// ============================================================================
// Candidats membres — profils pour le routing
// ============================================================================

function makeCandidate(role, expertise = []) {
  return {
    memberId: `agent-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    communityRole: role,
    provider: 'ollama',
    model: MODEL_NAME,
    expertise,
    capabilities: expertise,
    deterministicChecks: role === 'verifier' ? ['replay', 'benchmark'] : undefined
  };
}

function defaultCandidates() {
  return [
    makeCandidate('generator', ['architecture', 'comparative analysis', 'systems design']),
    makeCandidate('reviewer', ['critical review', 'assumption checking', 'risk analysis']),
    makeCandidate('verifier', ['reproducible_evidence', 'deterministic_check'])
  ];
}

// ============================================================================
// Member invoker — appelle le vrai LLM via HTTP direct Ollama
// ============================================================================

function buildMemberInvoker(timeoutMs = 90000) {
  return async (invocation) => {
    const member = invocation.member;
    const phase = invocation.phase;
    const task = invocation.task;
    const question = invocation.question;
    const questionType = invocation.questionType;
    const constitution = invocation.constitution;
    const details = invocation.context || {};

    const roleInstructions = {
      generator: 'Vous êtes un solveur indépendant. Produisez votre meilleur jugement sans vous conformer à ce que vous pensez être la majorité. Soyez précis et citez vos incertitudes.',
      reviewer: 'Vous êtes un réviseur critique. Examinez le claim assigné de manière rigoureuse. Identifiez les faiblesses, les hypothèses non vérifiées, les contre-exemples possibles. Soyez constructif mais exigeant.',
      adversarial_reviewer: 'Vous êtes un réviseur adversarial. Cherchez des contre-exemples concrets et des failles dans le claim assigné.',
      verifier: 'Vous êtes un vérificateur. Évaluez si les claims peuvent être vérifiés de manière déterministe. Identifiez ce qui est testable et ce qui ne l\'est pas.',
      community_facilitator: 'Vous facilitez la délibération sans prendre position sur le fond. Organisez le processus.'
    };

    const phaseInstruction = {
      SEALED_JUDGMENT: 'Phase 1 — Jugement initial scellé. Formez votre position INDÉPENDAMMENT avant de voir les autres positions. Produits des claims, assumptions, evidenceRefs, et confidence.',
      REVIEW: 'Phase 2 — Revue de claim. Analysez le claim assigné et produisez objections, arguments structurés (avec relation SUPPORT/ATTACK/REFUTE/UNDERCUT/QUALIFY/COUNTEREXAMPLE), dissent si matériel, et counterexamples.',
      REVISION: 'Phase 3 — Révision. Réexaminez vos positions initiales à la lumière des arguments et preuves présentés. Ne changez vos positions que si les preuves le justifient. Justifiez chaque changement avec un reasonCode (NEW_EVIDENCE, BETTER_ARGUMENT, SELF_CORRECTION, MAJORITY_SIGNAL, COUNTEREXAMPLE).'
    };

    const extraContext = [];
    if (details.claim) extraContext.push(`CLAIM ASSIGNÉ: ${JSON.stringify(details.claim)}`);
    if (details.prompts?.length) extraContext.push(`POINTS DE REVUE: ${details.prompts.join('; ')}`);
    if (details.claims?.length) {
      extraContext.push('CLAIMS à évaluation:');
      for (const c of details.claims) extraContext.push(`  - claimId=${c.claimId}: "${c.statement}"`);
    }
    if (details.reviews?.length) {
      extraContext.push('REVISIONS existantes:');
      for (const r of details.reviews) extraContext.push(`  Claim ${r.claimId}: ${r.review.summary || '(pas de résumé)'}`);
    }
    if (details.arguments?.length) {
      extraContext.push('ARGUMENTS:');
      for (const a of details.arguments) extraContext.push(`  [${a.relation}] ${a.argument}`);
    }
    if (details.initialJudgment) {
      extraContext.push(`VOTRE POSITION INITIALE: "${details.initialJudgment.position}" (confidence: ${details.initialJudgment.confidence})`);
    }
    if (details.anonymousFeedback) {
      extraContext.push(`RETOUR ANONYME: ${JSON.stringify(details.anonymousFeedback)}`);
    }
    if (invocation.validationErrors?.length) {
      extraContext.push(`VOTRE RÉPONSE PRÉCÉDENTE ÉTAIT INVALIDE: ${invocation.validationErrors.join('; ')}`);
      extraContext.push(`RÉPONSE PRÉCÉDENTE: ${JSON.stringify(invocation.previousResponse || {}).slice(0, 12000)}`);
      extraContext.push('Corrigez uniquement la structure ou les références invalides. Ne créez pas de preuve ni de claimId.');
    }

    const prompt = [
      `Vous participez a une deliberation Biocenose en tant que "${member.role}".`,
      `Role: ${member.role} | Phase: ${phase} | Question type: ${questionType}`,
      '',
      `MISSION: ${question}`,
      '',
      `TACHE: ${task}`,
      '',
      roleInstructions[member.role] || '',
      phaseInstruction[phase] || '',
      ...extraContext,
      constitution ? `\nCONSTITUTION: ${JSON.stringify(constitution, null, 2)}` : '',
      '',
      'REGLES STRICTES: Repondez UNIQUEMENT par un objet JSON valide. Aucun markdown, aucun texte hors JSON.',
      'Structure attendue selon la phase:',
      '  SEALED_JUDGMENT: {"position":"...","claims":[{"statement":"..."}],"assumptions":["..."],"evidenceRefs":["..."],"unknowns":["..."],"abstentions":[],"confidence":0.0-1.0}',
      '  REVIEW: {"summary":"...","objections":["..."],"arguments":[{"relation":"SUPPORT|ATTACK|REFUTE|UNDERCUT|QUALIFY|COUNTEREXAMPLE","argument":{"statement":"..."}}],"dissent":[],"counterexamples":["..."]}. Ne créez pas de claimId; le système associe chaque argument au claim assigné.',
      '  REVISION: {"changedClaims":["claimId fourni ci-dessus"],"previousPosition":"...","newPosition":"...","reasonCodes":["NEW_EVIDENCE|BETTER_ARGUMENT|SELF_CORRECTION|MAJORITY_SIGNAL|COUNTEREXAMPLE"],"evidenceRefs":["..."]}. Utilisez uniquement les claimId fournis; si aucune révision n’est justifiée, changedClaims et reasonCodes doivent être [].'
    ].filter(Boolean).join('\n');

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: [{ role: 'user', content: prompt }],
          format: 'json',
          stream: false
        }),
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Ollama HTTP ${response.status}: ${errText.slice(0, 200)}`);
      }

      const payload = await response.json();
      await invocation.onProviderObserved?.({
        memberId: member.memberId, provider: 'ollama', model: payload.model || null
      });
      const text = payload.message?.content || payload.response || payload.content || '';

      if (!text.trim()) throw new Error('Ollama returned an empty response');

      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      if (!cleaned) throw new Error('Ollama returned an empty JSON object');
      const parsed = JSON.parse(cleaned);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Ollama response is not a JSON object');
      return parsed;
    } catch (err) {
      throw new Error(`Ollama invocation failed: ${err.message}`);
    }
  };
}

// ============================================================================
// Niveaux de mission
// ============================================================================

const LEVELS = [
  {
    id: 1,
    mission: 'Petite API interne pour 5 developpeurs, 20 endpoints, clients uniquement internes, equipe peu experimentee avec GraphQL, besoin de livraison rapide. Vaut-il mieux utiliser REST ou GraphQL ? Produire un jugement collectif en conservant les objections minoritaires pertinentes.',
    questionType: 'DESIGN',
    variant: 'epistemic_jury'
  },
  {
    id: 2,
    mission: 'Une application souhaite faire passer la duree de session de 30 minutes a 24 heures pour reduire les plaintes utilisateurs. Analyser cette decision avec des perspectives securite, UX, support, operations et produit. Ne pas forcer un consensus.',
    questionType: 'NORMATIVE',
    variant: 'minority_preserving_jury'
  },
  {
    id: 3,
    mission: 'Une equipe de 12 developpeurs hesite entre monolithique modulaire et microservices. Elle possede 4 services metier, deploye deux fois par semaine, n\'a qu\'un DevOps et rencontre peu de problemes de monte en charge. Cartographer les arguments, contres-arguments, conditions et points de desaccord.',
    questionType: 'DESIGN',
    variant: 'epistemic_jury'
  },
  {
    id: 4,
    mission: 'Experience A/B: A conversion 10%, retention J30 62%, 10000 utilisateurs. B conversion 12%, retention J30 54%, 10200 utilisateurs. Chez les nouveaux utilisateurs, B domine fortement; chez les anciens, A domine. Deliberer sur la conclusion reelement permise par ces donnees. Preserver les claims contests et indiquer les experiences manquantes.',
    questionType: 'PROBABILISTIC',
    variant: 'forecasting_crowd'
  },
  {
    id: 5,
    mission: 'Une modification d\'authentification simplifie le code mais supprime la rotation des refresh tokens. Produire une revue communautaire ou securite, backend, exploitation, tests et produit rendent d\'abord des jugements independants. Une preuve reproductible d\'une vulnerabilite doit pouvoir bloquer un consensus majoritaire favorable. Tester direct du minority veto.',
    questionType: 'FACTUAL',
    variant: 'adversarial_assembly'
  },
  {
    id: 6,
    mission: 'Un papier affirme qu\'une nouvelle methode IA depasse l\'etat de l\'art. Elle gagne sur 6 benchmarks sur 8, mais utilise trois fois plus de calcul, deux benchmarks sont issus du meme dataset, aucune replication independante n\'existe et le gain disparait sur les donnees hors distribution. Former un jugement communautaire: claims robustes, claims faibles, desaccords, biais possibles, experience critique manquante et niveau de consensus reelement justifiable.',
    questionType: 'FACTUAL',
    variant: 'hybrid_oracle_community'
  }
];

function selectedLevels() {
  const requested = process.env.GENOS_BIOCENOSE_LEVEL;
  return requested ? LEVELS.filter((level) => String(level.id) === requested) : LEVELS;
}

// ============================================================================
// Rapport
// ============================================================================

function buildSummary(level, community, result, finalJudgment, events, elapsedMs) {
  const judgment = finalJudgment?.judgment || finalJudgment || {};
  const agg = judgment.aggregation || {};

  const activeMembers = (community?.members || []).filter(m => m.status !== 'QUARANTINED').length;

  const hasPluralism = judgment.status === 'IRREDUCIBLE_DISAGREEMENT'
    || judgment.status === 'HUMAN_REVIEW_REQUIRED'
    || (agg.outcome === 'PARETO_FRONT' && judgment.status === 'DECIDE')
    || agg.outcome === 'PLURALISM_PRESERVED'
    || agg.outcome === 'TYPE_SPECIFIC_PLURALISM';

  const hasVeto = (judgment.openCriticalDissentIds || []).length > 0
    || (judgment.dissentGates || []).some(g => g.promotion !== 'ALLOWED');

  const commitments = events.filter(e => e.type === 'JUDGMENT_COMMITTED');
  const claimEvents = events.filter(e => e.type === 'CLAIM_PUBLISHED');
  const argumentEvents = events.filter(e => e.type === 'ARGUMENT_ADDED');
  const modelEvents = events.filter(e => e.type === 'MODEL_PROVIDER_OBSERVED');
  const dissentEvents = events.filter(e => e.type === 'DISSENT_RECORDED');
  const revisionEvents = events.filter(e => e.type === 'BELIEF_REVISED');
  const terminal = typeof judgment.status === 'string' && judgment.status !== 'IN_PROGRESS';
  const error = judgment.error || (commitments.length === 0 ? 'No member judgments committed'
    : modelEvents.length === 0 ? 'No observed model provenance'
      : !terminal ? 'No terminal judgment persisted' : null);

  return {
    niveau: level.id,
    mission: level.mission,
    questionType: level.questionType,
    variant: level.variant,
    penalite: hasVeto ? 'MINORITY_VETO' : null,
    sessionId: community?.communityId || 'ERREUR',
    phaseFinale: community?.phase || 'ERREUR',
    membresActifs: activeMembers,
    variantExecutionLevel: judgment.variantExecutionLevel || null,
    jugementsEngagees: commitments.length,
    claimsPubliques: claimEvents.length,
    argumentsPublies: argumentEvents.length,
    modelesObserves: [...new Set(modelEvents.map((event) => `${event.payload.provider}:${event.payload.model || 'unknown'}`))],
    revisionsDeCroyance: revisionEvents.length,
    dissentEntrees: dissentEvents.length,
    dissentPreserves: (judgment.preservedDissentIds || []).length,
    dissentCritiquesOuverts: (judgment.openCriticalDissentIds || []).length,
    dissentGatesNonAutorisees: (judgment.dissentGates || []).filter(g => g.promotion !== 'ALLOWED').length,
    etapesEffectuees: events.filter(e => e.type.startsWith('DELIBERATION_STEP_COMPLETED')).length,
    aggregationOutcome: agg.outcome || null,
    arbitrage: judgment.promotionGate?.status || null,
    verdictFinal: judgment.status || 'EXECUTION_FAILED',
    arretee: commitments.length > 0 && terminal && judgment.status !== 'EXECUTION_FAILED',
    erreur: error,
    pluralismePreserve: hasPluralism && commitments.length > 0,
    vetoActif: hasVeto && commitments.length > 0,
    membresEngages: [...new Set(commitments.map((event) => event.actorId))]
  };
}

// ============================================================================
// Execution d'un niveau
// ============================================================================

async function runLevel(level, db) {
  const prefix = `[N${level.id}]`;
  const startTime = Date.now();

  console.error(`${prefix} Mission: ${level.mission.slice(0, 120)}...`);
  console.error(`${prefix} Type: ${level.questionType}, Variant: ${level.variant}`);

  const community = await biocenose.prepareCommunity({
    db,
    orchestratorId: `biocenose-niv${level.id}`,
    mission: level.mission,
    options: {
      questionType: level.questionType,
      variant: level.variant,
      population: { generators: 1, reviewers: 1, verifiers: 1 },
      memberCandidates: defaultCandidates()
    }
  });

  console.error(`${prefix} Communaute: ${community.communityId}, ${community.members.length} membres`);

  const memberInvoker = buildMemberInvoker(90000);

  // Injecter variantPolicy dans les handlers
  const constitution = await communityStore.latestConstitution(db, community.communityId);
  const variantPolicy = constitution ? variantPolicies.select(constitution.constitution.variant) : null;

  const handlers = variantPolicy
    ? protocolHandlers.createHandlers({ db, communityId: community.communityId, actorId: `biocenose-niv${level.id}`, memberInvoker, variantPolicy })
    : protocolHandlers.createHandlers({ db, communityId: community.communityId, actorId: `biocenose-niv${level.id}`, memberInvoker });

  let lastResult = null;
  let lastJudgment = null;
  let roundCount = 0;
  let stepFailure = null;
  const maxRounds = 5;

  for (let r = 0; r < maxRounds; r++) {
    roundCount = r + 1;
    console.error(`${prefix} Round ${roundCount}/${maxRounds}...`);

    try {
      lastResult = await biocenose.runBiocenoseRound({
        db,
        communityId: community.communityId,
        handlers,
        actorId: `biocenose-niv${level.id}`,
        memberInvoker,
        timeoutMs: 90000,
        maxTokens: 2500
      });

      console.error(`${prefix} Round ${roundCount}: status=${lastResult.status}`);

      if (lastResult.status !== 'IN_PROGRESS') break;

      const session = await communityStore.loadSession(db, community.communityId);
      if (session.status !== 'ACTIVE') break;
    } catch (err) {
      console.error(`${prefix} Round ${roundCount} ERREUR: ${err.message} (${err.code || 'no-code'})`);
      if (err.details?.validationErrors?.length) {
        console.error(`${prefix} Validation: ${err.details.validationErrors.join('; ')}`);
      }
      if (err.code === 'BIOCENOSE_RUNTIME_STEP_BLOCKED') { stepFailure = err.message; break; }
      if (r < maxRounds - 1) continue;
      throw err;
    }
  }

  const session = await communityStore.loadSession(db, community.communityId);
  const events = await communityStore.listEvents(db, community.communityId);
  const persisted = await db.get('SELECT judgment_json FROM biocenose_judgments WHERE community_id = ? ORDER BY round DESC LIMIT 1', community.communityId);
  if (persisted) lastJudgment = { judgment: JSON.parse(persisted.judgment_json) };

  console.error(`${prefix} Session: phase=${session?.phase}, status=${session?.status}, round=${session?.round}`);

  if (stepFailure) {
    lastJudgment = { judgment: { status: 'EXECUTION_FAILED', error: stepFailure } };
  } else if (!lastResult || lastResult.status === 'IN_PROGRESS') {
    console.error(`${prefix} Finalisation forcee...`);

    if (session?.phase !== 'AGGREGATION') {
      try {
        await communityStore.appendEvent(db, {
          communityId: community.communityId,
          actorId: `biocenose-niv${level.id}`,
          type: 'PHASE_CHANGED',
          payload: { from: session.phase, to: 'AGGREGATION' },
          patch: { phase: 'AGGREGATION' }
        });
      } catch (_) {}
    }

    const claims = await communityStore.listClaims(db, community.communityId, session.round);

    let aggregation;
    if (claims.length > 0) {
      const type = level.questionType;
      if (type === 'FACTUAL') {
        aggregation = { questionType: 'FACTUAL', outcome: 'UNRESOLVED', claims: claims.map(c => ({ claimId: c.claimId, statement: c.claimText })), unresolvedClaimIds: claims.map(c => c.claimId) };
      } else if (type === 'DESIGN' || type === 'MULTI_CRITERIA') {
        aggregation = { questionType: 'MULTI_CRITERIA', outcome: 'CLAIM_MAP', claims: claims.map(c => ({ claimId: c.claimId, statement: c.claimText })), openQuestions: claims.map(c => `A evaluer: ${c.claimText}`) };
      } else {
        aggregation = { questionType: type, outcome: 'UNRESOLVED', claims: claims.map(c => ({ claimId: c.claimId, statement: c.claimText })), unresolvedClaimIds: claims.map(c => c.claimId) };
      }
    } else {
      aggregation = { questionType: level.questionType, outcome: 'UNRESOLVED', unresolvedClaimIds: [] };
    }

    try {
      lastJudgment = await biocenose.finalizeCommunityJudgment({
        db,
        communityId: community.communityId,
        actorId: `biocenose-niv${level.id}`,
        aggregation,
        stopping: { stableRoundCount: 1, round: session.round },
        uncertainty: { independence: { measured: false, report: null } }
      });
      console.error(`${prefix} Finalisation: status=${lastJudgment.judgment?.status}`);
    } catch (err) {
      console.error(`${prefix} Finalisation ERREUR: ${err.message}`);
      lastJudgment = { judgment: { status: 'ESCALATED', error: err.message, aggregation: { outcome: 'REVIEW_REQUIRED', questionType: level.questionType } } };
    }
  } else if (lastResult.ecologicalDecision?.transition?.judgment) {
    lastJudgment = lastResult.ecologicalDecision.transition.judgment;
  }

  const elapsed = Date.now() - startTime;
  console.error(`${prefix} Termine en ${elapsed}ms — verdict=${lastJudgment?.judgment?.status || 'N/A'}\n`);

  return {
    summary: buildSummary(level, session, lastResult, lastJudgment, events, elapsed),
    raw: { community, result: lastResult, finalJudgment: lastJudgment, session, events, elapsed }
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const levels = selectedLevels();
  if (!levels.length) throw new Error('Unknown Biocenose level');
  console.error('[Biocenose] ============================================================');
  console.error('[Biocenose] Lancement des 6 niveaux de delibearation communautaire');
  console.error('[Biocenose] Infrastructure: biocenoseService + Ollama HTTP direct');
  console.error('[Biocenose] ============================================================\n');

  const db = await open({
    filename: process.env.GENOS_DB_PATH || ':memory:',
    driver: sqlite3.Database,
    mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
  });

  try {
    const { migrateBiocenoseSessions } = require(path.join(BACKEND_SRC, 'db/migrations/migrateBiocenoseSessions'));
    await migrateBiocenoseSessions(db);

    const results = [];
    console.error('EXECUTION NIVEAU PAR NIVEAU:\n');

    for (const level of levels) {
      try {
        results.push(await runLevel(level, db));
      } catch (err) {
        console.error(`[N${level.id}] ERREUR FATALE: ${err.message}\n${err.stack}\n`);
        results.push({
          summary: {
            niveau: level.id,
            mission: level.mission,
            questionType: level.questionType,
            variant: level.variant,
            penalite: 'EXECUTION_FAILED',
            sessionId: 'ERREUR',
            phaseFinale: 'ERREUR',
            membresActifs: 0,
            verdictFinal: 'EXECUTION_FAILED',
            erreur: err.message
          },
          raw: { error: err.message, stack: err.stack }
        });
      }
    }

    // Rapport JSON
    process.stdout.write('\n' + JSON.stringify({
      orchestrator: 'GenOS Biocenose V3',
      heure: new Date().toISOString(),
      total: levels.length,
      niveaux: results.map(r => r.summary)
    }, null, 2) + '\n');

    // Synthese textuelle
    console.error('\n' + '='.repeat(72));
    console.error('SYNTHESE PAR NIVEAU');
    console.error('='.repeat(72));

    for (const r of results) {
      const s = r.summary;
      console.error(`\n[N${s.niveau}] ${s.questionType} / ${s.variant}`);
      console.error(`  Mission: ${s.mission.slice(0, 120)}${s.mission.length > 120 ? '...' : ''}`);
      console.error(`  Verdict final: ${s.verdictFinal}${s.aggregationOutcome ? ` (${s.aggregationOutcome})` : ''}`);
      console.error(`  Session: ${s.sessionId} | Phase: ${s.phaseFinale} | Variant exec: ${s.variantExecutionLevel || 'N/A'}`);
      console.error(`  Membres: ${s.membresActifs} actifs | Jugements: ${s.jugementsEngagees} | Claims: ${s.claimsPubliques} | Args: ${s.argumentsPublies} | Revisions: ${s.revisionsDeCroyance}`);
      console.error(`  Dissent: ${s.dissentEntrees} entrees, ${s.dissentCritiquesOuverts} critiques ouverts, ${s.dissentPreserves} preserves, ${s.dissentGatesNonAutorisees} portes non-autorisees`);
      if (s.membresEngages?.length) console.error(`  Membres engagés: ${s.membresEngages.join(', ')}`);
      console.error(`  => Pluralisme preserve: ${s.pluralismePreserve ? 'OUI' : 'NON'} | Veto actif: ${s.vetoActif ? 'OUI' : 'non'}`);
      if (s.penalite) console.error(`  WARNING Pénalite: ${s.penalite}`);
      if (s.erreur) console.error(`  ERROR Erreur: ${s.erreur}`);
    }

    // Bilan global
    const total = results.length;
    const successful = results.filter(r => !r.summary.erreur).length;
    if (successful !== total) process.exitCode = 1;
    const pluralism = results.filter(r => r.summary.pluralismePreserve).length;
    const veto = results.filter(r => r.summary.vetoActif).length;
    const arrest = results.filter(r => r.summary.arretee).length;

    console.error('\n' + '='.repeat(72));
    console.error('BILAN GLOBAL');
    console.error('='.repeat(72));
    console.error(`Execute: ${successful}/${total} | Arretes: ${arrest}/${total}`);
    console.error(`Verdicts: DECIDE=${results.filter(r=>r.summary.verdictFinal==='DECIDE').length}, IRREDUCIBLE_DISAGREEMENT=${results.filter(r=>r.summary.verdictFinal==='IRREDUCIBLE_DISAGREEMENT').length}, HUMAN_REVIEW_REQUIRED=${results.filter(r=>r.summary.verdictFinal==='HUMAN_REVIEW_REQUIRED').length}`);
    console.error(`Pluralisme preserve: ${pluralism}/${total}`);
    console.error(`Veto minoritaire actif: ${veto}/${total}`);

    if (pluralism === 0) {
      console.error('\nATTENTION: Aucun niveau n\'a produit de pluralisme preserve.');
      console.error('   La Biocenose ne devrait pas toujours finir par "tout le monde est d\'accord".');
      console.error('   Sorties legitimes attendues: PARETO_PLURALISM, IRREDUCIBLE_DISAGREEMENT, HUMAN_REVIEW_REQUIRED, REQUEST_MORE_EVIDENCE.');
    }

    if (veto > 0) {
      console.error('\nVeto minoritaire actif detecte sur ' + veto + ' niveau(s) — minority veto fonctionnel.');
    }

    console.error('\n[Resultats JSON sur stdout]');

  } finally {
    await db.close();
  }
}

main().catch(err => {
  console.error('[Biocenose] FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
