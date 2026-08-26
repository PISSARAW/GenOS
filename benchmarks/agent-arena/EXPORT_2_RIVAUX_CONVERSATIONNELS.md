# Harnais rivaux — AutoGen, CrewAI, LangGraph

## harnesses/autogen.mjs

```js
import { join } from "node:path";
import { scaffoldWorkspace, ws, runClaude, Ledger, sh, resultsDir } from "./lib.mjs";

const AGENT = "autogen";
const dir = scaffoldWorkspace(AGENT);
const ledger = new Ledger(AGENT);
const MAX_ROUNDS = 6;

const coderBase = `Tu es CoderAgent dans un GroupChat AutoGen. Ton repertoire de travail courant contient SCENARIO.md.
Lis SCENARIO.md puis implemente ou corrige le middleware en Rust dans src/.
Reponds uniquement par un court resume technique de ce que tu as ecrit/modifie.`;

const criticTemplate = (focus) => `Tu es ${focus.name} dans un GroupChat AutoGen.
Lis les fichiers .rs du repertoire courant et verifie l'aspect suivant : ${focus.check}.
Reponds EXACTEMENT au format :
VERDICT: PASS
ou
VERDICT: FAIL
ISSUES:
- <probleme concret et correctif precise>`;

async function verify(round) {
  ledger.log(`[UserProxy] round ${round}: cargo test`);
  const test = await sh("cargo test", dir);
  const clippy = await sh("cargo clippy --all-targets -- -D warnings", dir);
  return { test, clippy, green: test.code === 0 && clippy.code === 0 };
}

let consoleOutput = "(premiere iteration, aucun output)";
let finalVerdict = "MAX_ROUNDS_REACHED";

for (let round = 1; round <= MAX_ROUNDS; round++) {
  const coder = await runClaude({
    cwd: dir,
    label: `round${round}-coder`,
    maxTurns: 40,
    prompt: `${coderBase}\n\nSortie console de la derniere verification (UserProxyAgent):\n${consoleOutput.slice(-6000)}`,
  });
  ledger.add(coder.meta);

  const { test, clippy, green } = await verify(round);
  consoleOutput = `${test.output}\n${clippy.output}`;

  if (!green) {
    ledger.log(`[UserProxy] round ${round}: NOT green, back to coder`);
    continue;
  }

  const [security, perf] = await Promise.all([
    runClaude({
      cwd: dir,
      label: `round${round}-SecurityCritic`,
      prompt: criticTemplate({ name: "SecurityCritic", check: "attaques temporelles (comparaison constant-time), hachage des secrets, validation stricte des entrees, injection" }),
    }),
    runClaude({
      cwd: dir,
      label: `round${round}-PerformanceCritic`,
      prompt: criticTemplate({ name: "PerformanceCritic", check: "allocations inutiles dans le chemin critique, complexite, structures de donnees, respect du budget <1ms pour 10000 requetes" }),
    }),
  ]);
  ledger.add(security.meta);
  ledger.add(perf.meta);

  const pass = /VERDICT:\s*PASS/i.test(security.text) && /VERDICT:\s*PASS/i.test(perf.text);
  ledger.log(`[GroupChat] SecurityCritic=${/VERDICT:\s*(PASS|FAIL)/i.exec(security.text)?.[1]} PerformanceCritic=${/VERDICT:\s*(PASS|FAIL)/i.exec(perf.text)?.[1]}`);
  if (pass) {
    finalVerdict = `CONSENSUS_ROUND_${round}`;
    break;
  }
  consoleOutput += `\nCritiques:\n${security.text.slice(0, 2000)}\n${perf.text.slice(0, 2000)}`;
}

ledger.dump({ termination: finalVerdict });
console.log(`[${AGENT}] termine: ${finalVerdict}`);

```

## harnesses/crewai.mjs

```js
import { join } from "node:path";
import { scaffoldWorkspace, runClaude, Ledger, sh } from "./lib.mjs";

const AGENT = "crewai";
const dir = scaffoldWorkspace(AGENT);
const ledger = new Ledger(AGENT);

const persona = (role, goal, backstory, task) => `Tu es un agent CrewAI avec un persona strict.
Role: ${role}
Objectif: ${goal}
Historique: ${backstory}
Ta tache (Task): ${task}
Travaille directement dans le repertoire courant (lis SCENARIO.md). Reponds par un resume bref de ton livrable.`;

const architect = await runClaude({
  cwd: dir,
  label: "task1-architect",
  maxTurns: 40,
  prompt: persona(
    "Senior Rust Architect",
    "Ecrire un middleware ultra-performant et securise (timing-safe, hachage, validation stricte, rate limiting)",
    "15 ans de systemes bas niveau, obnubile par le zero-allocation et la surete memoire",
    "Implementer src/lib.rs (+ modules si besoin) conformement a SCENARIO.md",
  ),
});
ledger.add(architect.meta);

const qa = await runClaude({
  cwd: dir,
  label: "task2-qa",
  maxTurns: 30,
  prompt: persona(
    "QA Automation Engineer",
    "Produire une suite de tests exhaustive visant 100% de couverture incluant un bench bench_10k (<1ms moyen sur 10000 requetes)",
    "Specialiste des tests de propriete et des cas limites",
    "Ajouter les tests unitaires exhaustifs au crate existant (ne regraisse pas l'implementation)",
  ),
});
ledger.add(qa.meta);

const reviewRun = await sh("cargo test && cargo clippy --all-targets -- -D warnings", dir);
ledger.log(`[tooling] verification: exit=${reviewRun.code}`);
const testCount = parseInt(/(\d+) passed/.exec(reviewRun.output)?.[1] ?? "0", 10);
const objectiveGreen = reviewRun.code === 0 && testCount > 0;

let reviewerText = "";
for (let attempt = 1; attempt <= 3 && !(objectiveGreen && /APPROVED/i.test(reviewerText ?? "")); attempt++) {
  const reviewer = await runClaude({
    cwd: dir,
    label: `task3-reviewer-${attempt}`,
    maxTurns: 25,
    prompt: persona(
      "Strict Code Reviewer",
      "Traquer tout warning clippy et toute faille timing attack; valider la qualite globale",
      "Ancien auditeur cryptographique, intraitable. Tu dois lire chaque fichier .rs avec read_file AVANT de juger.",
      `Inspecte le code ET les resultats d'execution suivants.\n\nResultats cargo (exit=${reviewRun.code}, tests passes=${testCount}):\n${reviewRun.output.slice(-4000)}\n\nVerifie aussi que SCENARIO.md est respecte (constant-time, hachage, validation stricte, bench_10k <1ms, couverture).\nSi une contrainte n'est pas respectee ou si les tests sont absents/insuffisants, liste les corrections OBLIGATOIRES sous 'DELEGATION:' sinon reponds 'APPROVED'.`,
    ),
  });
  ledger.add(reviewer.meta);
  reviewerText = reviewer.text;
  if (objectiveGreen && /APPROVED/i.test(reviewerText)) break;
  if (!objectiveGreen || !/DELEGATION/i.test(reviewerText)) {
    // le reviewer doit deleguer : on force une passe de correction sur la base du verdict mecanique
    reviewerText = reviewerText.includes("DELEGATION")
      ? reviewerText
      : `DELEGATION:\n- Les tests mecaniques sont ${objectiveGreen ? "OK" : `en echec (exit=${reviewRun.code}, tests=${testCount})`}. Corriger l'implementation pour satisfaire SCENARIO.md.`;
  }

  const fix = await runClaude({
    cwd: dir,
    label: `delegation-fix-${attempt}`,
    maxTurns: 50,
    prompt: `${persona("Senior Rust Architect", "corriger le code selon la delegation du reviewer", "tu appliques les revues sans discuter", "applique les corrections demandees")}\n\nDelegation du reviewer:\n${reviewerText.slice(0, 4000)}`,
  });
  ledger.add(fix.meta);
  const rerun = await sh("cargo test && cargo clippy --all-targets -- -D warnings", dir);
  ledger.log(`[tooling] reverification apres delegation ${attempt}: exit=${rerun.code}`);
}

const finalRun = await sh("cargo test", dir);
const finalTests = parseInt(/(\d+) passed/.exec(finalRun.output)?.[1] ?? "0", 10);

ledger.dump({ reviewerApproved: /APPROVED/i.test(reviewerText), finalTestsPassed: finalTests });
console.log(`[${AGENT}] termine. Reviewer: ${/APPROVED/i.test(reviewerText) ? "APPROVED" : "NON APPROUVE"}, tests finaux: ${finalTests}`);

```

## harnesses/langgraph.mjs

```js
import { join } from "node:path";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { scaffoldWorkspace, runClaude, Ledger, sh } from "./lib.mjs";

const AGENT = "langgraph";
const dir = scaffoldWorkspace(AGENT);
const ledger = new Ledger(AGENT);
const statePath = join(dir, ".graph_state.json");

const MAX_VISITS = { write_code: 6 };
let state = {
  node: "write_code",
  visits: { write_code: 0 },
  code_source_present: false,
  test_failures: null,
  lint_warnings: null,
  benchmark_ok: null,
  security_approved: false,
  feedback: "(aucune)",
};

function saveState() {
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

async function writeCodeNode() {
  state.visits.write_code++;
  const res = await runClaude({
    cwd: dir,
    label: `node-write_code-${state.visits.write_code}`,
    maxTurns: 40,
    prompt: `Tu es le noeud Write_Code d'un graphe LangGraph. Lis SCENARIO.md puis ecris/corrige le code Rust dans src/.
Etat courant du graphe:
${JSON.stringify(state, null, 2)}
Retour d'erreur precedent a prendre en compte:
${String(state.feedback).slice(-5000)}
Reponds par un resume bref.`,
  });
  ledger.add(res.meta);
}

async function sandboxEvaluatorNode() {
  const hasCode = existsSync(join(dir, "src", "lib.rs"));
  const test = await sh("cargo test", dir);
  const clippy = await sh("cargo clippy --all-targets -- -D warnings", dir);
  state.code_source_present = hasCode;
  state.test_failures = test.code === 0 ? 0 : (/\d+ failed/.exec(test.output)?.[1] ?? "compile/other");
  state.lint_warnings = clippy.code === 0 ? 0 : ">0";
  state.feedback = `${test.output}\n${clippy.output}`;
  ledger.log(`[Run_Sandbox_Evaluator] tests=${state.test_failures} lint=${state.lint_warnings}`);
}

async function securityAuditNode() {
  const res = await runClaude({
    cwd: dir,
    label: `node-security_audit-${state.visits.write_code}`,
    prompt: `Tu es le noeud Security_Audit d'un graphe LangGraph.
Lis les fichiers .rs du repertoire et verifie: comparaisons constant-time sur les secrets, hachage cryptographique des jetons, validation stricte des entrees, aucune injection possible.
Reponds EXACTEMENT:
SECURITY_APPROVED: true
ou
SECURITY_APPROVED: false
ISSUES:
- ...`,
  });
  ledger.add(res.meta);
  state.security_approved = /SECURITY_APPROVED:\s*true/i.test(res.text);
  if (!state.security_approved) state.feedback = res.text;
}

while (true) {
  saveState();
  const { node } = state;

  if (node === "write_code") {
    if (state.visits.write_code >= MAX_VISITS.write_code) {
      state.node = "END_MAX_VISITS";
      continue;
    }
    await writeCodeNode();
    await sandboxEvaluatorNode();
    // Arete conditionnelle
    state.node =
      state.test_failures === 0 && state.lint_warnings === 0 ? "security_audit" : "write_code";
  } else if (node === "security_audit") {
    await securityAuditNode();
    // Arete conditionnelle
    state.node = state.security_approved ? "END_SUCCESS" : "write_code";
  } else {
    break; // END_*
  }
}
saveState();

const metrics = ledger.dump({ termination: state.node, finalState: state });
console.log(`[${AGENT}] termine: ${state.node} (${metrics.llmCalls} appels LLM)`);

```
