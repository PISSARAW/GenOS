# Harnais rivaux — MetaGPT, GenOS, Mastra

## harnesses/metagpt.mjs

```js
import { join } from "node:path";
import { existsSync } from "node:fs";
import { scaffoldWorkspace, runClaude, Ledger, sh } from "./lib.mjs";

const AGENT = "metagpt";
const dir = scaffoldWorkspace(AGENT);
const ledger = new Ledger(AGENT);

const role = (name, instruction) =>
  `Tu es le ${name} d'une equipe MetaGPT suivant strictement les SOP (cascade Waterfall).
${instruction}
Travaille dans le repertoire courant. Reponds par un resume bref de ton livrable.`;

// Phase 1 : Product Manager -> PRD
const pm = await runClaude({
  cwd: dir,
  label: "phase1-pm-prd",
  maxTurns: 15,
  prompt: role("Product Manager", `Lis SCENARIO.md puis produis docs/PRD.md : un Product Requirements Document standardise qui fige les exigences (securite timing-safe, hachage, validation stricte, rate limiting <1ms sur 10000 requetes, couverture 100%, clippy zero warning) avec criteres d'acceptation mesurables.`),
});
ledger.add(pm.meta);

// Phase 2 : Architect -> design + interfaces
const architect = await runClaude({
  cwd: dir,
  label: "phase2-architect-design",
  maxTurns: 20,
  prompt: role("Architect", `Lis docs/PRD.md puis produis docs/DESIGN.md : diagramme de conception textuel, choix algorithmiques (ex: token bucket vs fenetre glissante, stockage des digests), signatures/interfaces publiques completes des types et fonctions, plan de modules. L'Engineer implementera EXACTEMENT ces interfaces.`),
});
ledger.add(architect.meta);

// Phase 3 : Engineer -> implementation fidele au design
const engineer = await runClaude({
  cwd: dir,
  label: "phase3-engineer-code",
  maxTurns: 40,
  prompt: role("Engineer", `Lis docs/PRD.md et docs/DESIGN.md puis implemente EXACTEMENT les interfaces designees en Rust dans src/. Aucune deviation du design autorisee.`),
});
ledger.add(engineer.meta);

// Phase 4 : QA -> tests associes
const qa = await runClaude({
  cwd: dir,
  label: "phase4-qa-tests",
  maxTurns: 30,
  prompt: role("QA Engineer", `Lis src/ et docs/DESIGN.md puis redige les tests unitaires exhaustifs visant 100% de couverture, incluant un test bench_10k (<1ms moyen sur 10000 validations). N'ajoute pas de code produit.`),
});
ledger.add(qa.meta);

// Verification finale enregistree telle quelle (pas de boucle : philosophie cascade)
const verification = await sh("cargo test && cargo clippy --all-targets -- -D warnings", dir);
ledger.log(`[waterfall] verification finale: exit=${verification.code}`);

// MetaGPT inclut une passe interne de code review de l'Engineer (unique)
if (verification.code !== 0) {
  const hotfix = await runClaude({
    cwd: dir,
    label: "phase5-engineer-self-review",
    maxTurns: 40,
    prompt: `${role("Engineer", "Passe de revue interne obligatoire avant livraison : corrige ton implementation pour satisfaire SCENARIO.md.")}\nErreurs de verification:\n${verification.output.slice(-5000)}`,
  });
  ledger.add(hotfix.meta);
  const rerun = await sh("cargo test && cargo clippy --all-targets -- -D warnings", dir);
  ledger.log(`[waterfall] apres self-review: exit=${rerun.code}`);
}

const compiled = existsSync(join(dir, "docs", "PRD.md")) && existsSync(join(dir, "docs", "DESIGN.md"));
ledger.dump({ sopArtifactsComplete: compiled });
console.log(`[${AGENT}] termine. Artefacts SOP complets: ${compiled}`);

```

## harnesses/genos.mjs

```js
#!/usr/bin/env node
// GenOS Orchestrator — paradigme GenOS : planification, recrutement d'un essaim
// de workers specialises en parallele, agent telemetrique dedie, integration
// et verification par le centre (event-sourcing des decisions dans results/).
import { join } from "node:path";
import { readdirSync } from "node:fs";
import { scaffoldWorkspace, runClaude, Ledger, sh } from "./lib.mjs";

const AGENT = "genos";
const dir = scaffoldWorkspace(AGENT);
const ledger = new Ledger(AGENT);

function listWorkspaceFiles(d) {
  const files = [];
  const walk = (p, prefix = "") => {
    for (const e of readdirSync(p, { withFileTypes: true })) {
      if (e.name === "target" || e.name.startsWith(".")) continue;
      if (e.isDirectory()) walk(join(p, e.name), `${prefix}${e.name}/`);
      else files.push(`${prefix}${e.name}`);
    }
  };
  try { walk(d); } catch {}
  return files;
}

async function claude(label, prompt, maxTurns = 30) {
  const res = await runClaude({ cwd: dir, label, maxTurns, prompt });
  ledger.add(res.meta);
  return res.text;
}

// Phase 1 : Planification du centre
ledger.log("[orchestrator] phase 1: planification");
await claude(
  "plan",
  `Tu es l'Orchestrateur GenOS. Lis SCENARIO.md puis ecris PLAN.md : une decomposition en 3 lots parallelisables (implementation coeur, durcissement securite, tests+bench), avec interfaces partagees precises que les workers devront respecter pour s'integrer sans conflit. Sois bref et operationnel.`,
  15,
);

// Phase 2 : Essaim parallele + telemetrie
ledger.log("[orchestrateur] phase 2: deploiement de l'essaim (3 workers + observer)");
const workerPrompt = (lot) =>
  `Tu es ${lot.name} recruite par l'Orchestrateur GenOS. Lis SCENARIO.md puis PLAN.md.
Respecte STRICTEMENT les interfaces du plan (ne modifie pas ce qui appartient aux autres lots).
${lot.instruction}
Reponds par un rapport bref: fichiers crees, signatures exposees, points d'integration.`;

const [impl, hardening, qa] = await Promise.all([
  claude("worker_impl", workerPrompt({ name: "Worker-Impl", instruction: "Lot 1: implemente le coeur du middleware dans src/." }), 40),
  runHardening(),
  runQa(),
]);

async function runHardening() {
  // demarre apres un delai court pour laisser le squelette du lot 1 apparaitre,
  // mais reste reellement parallele.
  await new Promise((r) => setTimeout(r, 20_000));
  return claude("worker_security", workerPrompt({ name: "Worker-Security", instruction: "Lot 2: audite et durcis la securite du code existant (constant-time, hachage, validation stricte). Corrige directement src/." }), 30);
}

async function runQa() {
  await new Promise((r) => setTimeout(r, 45_000));
  return claude("worker_qa", workerPrompt({ name: "Worker-QA", instruction: "Lot 3: redige les tests unitaires exhaustifs + bench_10k (<1ms moyen / 10000 requetes). Complete sans reecrire l'implementation." }), 30);
}

// Phase 3 : Observateur telemetrique dedie (regle AGENTS.md n°7)
await Promise.race([
  runClaude({
    cwd: dir,
    label: "telemetry_observer",
    maxTurns: 10,
    prompt: `Tu es l'Agent Telemetrique de l'essaim GenOS. Lis les fichiers du repertoire (code + rapports workers ci-dessous) et produis TELEMETRY.md : tableau des livrables par worker, incoherences d'interfaces detectees, risques sur les 3 contraintes.\n\nRapports:\nIMPL: ${String(impl).slice(0, 1500)}\nSECURITY: ${String(hardening).slice(0, 1500)}\nQA: ${String(qa).slice(0, 1500)}`,
  }),
  new Promise((r) => setTimeout(() => r(null), 4 * 60_000)),
]);

// Phase 4 : Integration & verification par le centre (max 4 rounds)
let termination = "INTEGRATION_INCOMPLETE";
for (let round = 1; round <= 4; round++) {
  const test = await sh("cargo test", dir);
  const clippy = await sh("cargo clippy --all-targets -- -D warnings", dir);
  const testCount = parseInt(/(\d+) passed/.exec(test.output)?.[1] ?? "0", 10);
  const hasSecuritySurface = /bench_10k|rate_limit|constant/i.test(JSON.stringify(listWorkspaceFiles(dir)));
  ledger.log(`[integration] round ${round}: test=${test.code} clippy=${clippy.code} tests_passes=${testCount}`);
  if (test.code === 0 && clippy.code === 0 && testCount > 0 && hasSecuritySurface) {
    termination = "INTEGRATION_OK";
    break;
  }
  if (round === 4) break;
  await claude(
    `integrator-${round}`,
    `Tu es l'Orchestrateur GenOS en phase d'integration. Etat mecanique: cargo test exit=${test.code} (${testCount} tests passes), clippy exit=${clippy.code}.
Corrige/complete le crate pour satisfaire SCENARIO.md : implementation complete du middleware, tests unitaires exhaustifs sur toute la logique publique, un test nomme bench_10k (10000 validations authentifiees, moyenne <1ms), comparaison constant-time, hachage SHA-256 des jetons, validation stricte des entrees.
Erreurs:\n${(test.output + clippy.output).slice(-6000)}`,
    50,
  );
}

const metrics = ledger.dump({ termination });
console.log(`[${AGENT}] termine: ${termination} (${metrics.llmCalls} appels LLM, swarm parallele)`);

```

## harnesses/mastra.mjs

```js
#!/usr/bin/env node
// Harnais Mastra AI — paradigme : pipeline logiciel orchestre, typage fort,
// graphe deterministe (then/parallel/branch), human-in-the-loop avec
// suspension/reprise, persistance d'etat et observabilite native + evals.
import { join } from "node:path";
import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync, appendFileSync, readdirSync } from "node:fs";
import { scaffoldWorkspace, runClaude, sh, Ledger } from "./lib.mjs";

const AGENT = "mastra";
const dir = scaffoldWorkspace(AGENT);
const ledger = new Ledger(AGENT);

// --- Observabilite native : trace structuree de chaque evenement ---
const tracePath = join(dir, ".mastra", "traces.jsonl");
mkdirSync(join(dir, ".mastra"), { recursive: true });
let spanId = 0;
function trace(span, attributes) {
  appendFileSync(tracePath, JSON.stringify({ ts: new Date().toISOString(), spanId: ++spanId, span, ...attributes }) + "\n");
}

// --- Persistance d'etat du workflow ---
const statePath = join(dir, ".mastra", "workflow_state.json");
let state = {
  workflow: "secure-middleware-v1",
  step: "spec",
  attempt: 0,
  suspended: null, // { reason, resumeStep }
  steps: {},       // sorties validees par etape (contrat type)
};
function persist() {
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  trace("state.persist", { step: state.step, attempt: state.attempt });
}

// --- Validation typee des entrees/sorties (esprit Zod) ---
const Schemas = {
  spec: (v) => typeof v?.api_surface === "string" && v.api_surface.length > 100 && Array.isArray(v?.invariants),
  impl: (v) => v?.filesWritten?.length > 0,
  verify: (v) => Number.isInteger(v?.testsPassed) && typeof v?.clippyGreen === "boolean",
  securityGate: (v) => typeof v?.approved === "boolean" && Array.isArray(v?.findings),
  evals: (v) => Number.isInteger(v?.score),
};

function validate(step, payload) {
  const ok = Schemas[step]?.(payload) ?? true;
  if (!ok) trace("schema.violation", { step });
  return ok;
}

async function llmStep(name, prompt, maxTurns = 35) {
  trace("llm.start", { step: name });
  const res = await runClaude({ cwd: dir, label: `wf-${name}`, maxTurns, prompt });
  trace("llm.end", { step: name, durationMs: res.meta.durationMs, tokensIn: res.meta.inputTokens, tokensOut: res.meta.outputTokens, turns: res.meta.turns });
  ledger.add(res.meta);
  return res.text;
}

// --- Etapes du graphe ---

async function stepSpec() {
  const text = await llmStep(
    "spec",
    `Tu es l'etape Spec d'un workflow Mastra (pipeline strict). Lis SCENARIO.md puis ecris docs/SPEC.md definissant la surface d'API complete du middleware (types Rust publics, signatures, invariants securite/perf/qualite) comme un contrat figure que les etapes suivantes implementeront sans deviation. Reponds ensuite STRICTEMENT en JSON: {"api_surface": "<resume long>", "invariants": ["...", "..."]}`,
    20,
  );
  let parsed;
  try { parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch {}
  parsed ??= { api_surface: String(text).slice(0, 2000), invariants: [] };
  if (!validate("spec", parsed)) throw new Error("sortie d'etape spec invalide");
  state.steps.spec = parsed;
}

async function parallelImplementation() {
  // workflow.parallel() : les deux branches partent du contrat spec, jamais l'une de l'autre
  const contract = state.steps.spec;
  const [core, tests] = await Promise.all([
    llmStep("impl_core", `Tu es l'etape ImplCore d'un workflow Mastra. Implemente src/lib.rs (+ modules) conformement a SCENARIO.md et au contrat ci-dessous, SANS toucher aux tests.\n\nCONTRAT:\n${JSON.stringify(contract).slice(0, 3000)}`),
    (() => new Promise((r) => setTimeout(() => r(null), 15_000)).then(() =>
      llmStep("impl_tests", `Tu es l'etape ImplTests d'un workflow Mastra. Redige les tests unitaires exhaustifs + un test nomme bench_10k (10000 validations authentifiees, moyenne <1ms) conformement a SCENARIO.md et au contrat ci-dessous, SANS reecrire l'implementation.\n\nCONTRAT:\n${JSON.stringify(contract).slice(0, 3000)}`, 30)
    )),
  ]);
  state.steps.impl = { filesWritten: ["src/lib.rs", "src/tests.rs"] };
  validate("impl", state.steps.impl);
}

async function stepVerify() {
  const test = await sh("cargo test", dir);
  const clippy = await sh("cargo clippy --all-targets -- -D warnings", dir);
  const testsPassed = parseInt(/(\d+) passed/.exec(test.output)?.[1] ?? "0", 10);
  const result = { testsPassed, clippyGreen: clippy.code === 0, testExit: test.code };
  if (!validate("verify", result)) result.testsPassed = -1;
  trace("verify.result", result);
  return { ...result, output: test.output + clippy.output };
}

async function stepSecurityGate() {
  // Human-in-the-Loop : le workflow se suspend, un "approbateur" externe rend sa decision
  state.suspended = { reason: "security_approval_required", resumeStep: "security_gate" };
  state.step = "security_gate";
  persist();
  trace("workflow.suspend", { reason: state.suspended.reason });

  const audit = await llmStep(
    "security_audit",
    `Tu es l'Approbateur Humain simule du workflow Mastra (human-in-the-loop). Le pipeline est SUSPENDU en attente de ta signature.
Lis les fichiers .rs du repertoire et audite: comparaisons constant-time sur les secrets, hachage cryptographique des jetons, validation stricte des entrees, absence d'injection, bench_10k present.
Reponds EXACTEMENT:
APPROVED: true|false
FINDINGS:
- ...`,
    20,
  );
  const approved = /APPROVED:\s*true/i.test(audit);
  const findings = [...audit.matchAll(/^\s*-\s+(.+)$/gm)].map((m) => m[1]).slice(0, 10);
  state.suspended = null;
  state.steps.securityGate = { approved, findings };
  validate("securityGate", state.steps.securityGate);
  trace("workflow.resume", { approved });
  return approved;
}

async function stepFix(feedback) {
  await llmStep(
    `fix-${state.attempt}`,
    `Tu es l'etape Fix d'un workflow Mastra (routage conditionnel retour amont). Corrige/complete le crate pour satisfaire SCENARIO.md.\n\nDiagnostic de l'etape Verify/Gate:\n${String(feedback).slice(-6000)}`,
    50,
  );
}

async function stepEvals() {
  // Observabilite + Evals natifs : notation mecanique post-execution
  const test = await sh("cargo test", dir);
  const clippy = await sh("cargo clippy --all-targets -- -D warnings", dir);
  const testsPassed = parseInt(/(\d+) passed/.exec(test.output)?.[1] ?? "0", 10);
  const hasBench = /bench_10k/.test(JSON.stringify(listRs()));
  const score = (test.code === 0 ? 40 : 0) + (clippy.code === 0 ? 30 : 0) + (hasBench ? 20 : 0) + Math.min(testsPassed, 5) * 2;
  const evals = { score, testsPassed, clippyGreen: clippy.code === 0, hasBench };
  writeFileSync(join(dir, "EVALS.json"), JSON.stringify(evals, null, 2));
  trace("evals.completed", evals);
  return evals;
}

function listRs() {
  const out = [];
  const walk = (p) => {
    try {
      for (const e of readdirSync(p, { withFileTypes: true })) {
        if (e.name === "target" || e.name.startsWith(".")) continue;
        if (e.isDirectory()) walk(join(p, e.name));
        else if (e.name.endsWith(".rs")) out.push(e.name);
      }
    } catch {}
  };
  walk(dir);
  return out;
}

// --- Execution du graphe : then -> parallel -> verify -> branch -> gate -> evals ---
const MAX_LOOPS = 4;
state.step = "spec";
persist();
await stepSpec();

state.step = "parallel_implementation";
persist();
await parallelImplementation();

state.step = "verify";
let verification = await stepVerify();
while (!(verification.testExit === 0 && verification.clippyGreen && verification.testsPassed > 0)) {
  state.attempt++;
  trace("branch.route", { to: "fix", attempt: state.attempt });
  if (state.attempt > MAX_LOOPS) break;
  await stepFix(verification.output);
  verification = await stepVerify();
}
state.steps.verify = { testsPassed: verification.testsPassed, clippyGreen: verification.clippyGreen };

let approved = false;
if (verification.testsPassed > 0 && verification.clippyGreen) {
  approved = await stepSecurityGate();
  while (!approved && state.attempt <= MAX_LOOPS) {
    state.attempt++;
    await stepFix(state.steps.securityGate.findings.join("\n"));
    verification = await stepVerify();
    if (verification.testExit === 0 && verification.clippyGreen) approved = await stepSecurityGate();
    else state.steps.securityGate = { approved: false, findings: ["build casse"] };
  }
}

state.step = "evals";
persist();
const evals = await stepEvals();

const termination = approved ? "WORKFLOW_APPROVED" : `NOT_APPROVED_ATTEMPT_${state.attempt}`;
state.step = termination;
persist();

const metrics = ledger.dump({
  termination,
  evalScore: evals.score,
  securityApproved: approved,
  attempts: state.attempt,
});
console.log(`[${AGENT}] termine: ${termination}, evals=${evals.score}/100 (${metrics.llmCalls} appels LLM)`);

```
