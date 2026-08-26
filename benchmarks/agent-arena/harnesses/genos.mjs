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
