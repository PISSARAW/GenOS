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
